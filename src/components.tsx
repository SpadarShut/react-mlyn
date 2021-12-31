import React, { useMemo } from "react";
import { seal } from "./utils";
import { useCompute, useObervableValue } from "./hooks";
import { createSubject, runInReactiveScope, Subject } from "mlyn";

interface ShowProps {
  when: () => any;
  children: () => React.ReactElement;
}

export const Show = seal(({ when, children }: ShowProps) => {
  const visible = useCompute(() => Boolean(when()));
  return visible && children();
});

interface Props<T> {
  noBindBack?: boolean;
  each: Subject<T[]>;
  children(item: Subject<T>, index: Subject<number>): React.ReactElement;
}

export const For = seal(<T extends any>(props: Props<T>) => {
  const { each, children, noBindBack } = props;
  const bindBack = !noBindBack;
  const updateClosure = useMemo(() => {
    let renderItems = [];
    let prevItems = [];
    let rendering = false;
    return () => {
      rendering = true;
      const newItems = each();
      let suffix = [];

      let changesStart: number;
      let end;
      let changesEnd;
      const prevLen = prevItems.length;
      const newLen = newItems.length;
      if (newLen === 0) {
        if (bindBack) {
          renderItems.forEach(entry => entry.backScope.destroy());
        }
        renderItems = [];
      } else if (prevLen === 0) {
        renderItems = [];
        for (let i = 0; i < newLen; i++) {
          const subj$ = createSubject(newItems[i]);
          renderItems.push({
            subj$,
            Item: seal(() => children(subj$, createSubject(i))),
            key: i,
            backScope: bindBack && runInReactiveScope(() => {
              if (!rendering) {
                each[i](subj$());
              }
            }),
          });
        }
      } else if (prevLen !== newLen) {
        for (
          changesStart = 0, end = Math.min(prevLen, newLen);
          changesStart < end &&
          prevItems[changesStart] === newItems[changesStart];
          changesStart++
        );

        // common suffix
        for (
          end = prevLen - 1, changesEnd = newLen - 1;
          end >= changesStart &&
          changesEnd >= changesStart &&
          prevItems[end] === newItems[changesEnd];
          end--, changesEnd--
        ) {
        }
        suffix = renderItems.slice(end + 1);

        const midStart = changesStart + 1;
        const mid = renderItems.slice(midStart, -suffix.length);
        const newMidEnd = newLen - suffix.length;
        const prevMidEnd = prevLen - suffix.length;
        if (bindBack) {
          for (let i = newMidEnd; i < prevMidEnd; i++) {
            renderItems[i].backScope.destroy();
          }
        }
        for (let i = changesStart; i < newMidEnd; i++) {
          let j = i - changesStart;
          if (j >= mid.length) {
            const subj$ = createSubject(newItems[i]);
            mid[j] = {
              subj$,
              Item: seal(() => children(subj$, createSubject(i))),
              key: i,
              backScope: bindBack && runInReactiveScope(() => {
                if (!rendering) {
                  each[i](subj$());
                }
              }),
            };
          } else {
            // @ts-ignore
            if (mid[j].subj$.__curried !== newItems[j]) {
              mid[j].subj$(newItems[j]);
            }
          }
        }
        
        if (changesStart > 0) {
          renderItems = renderItems.slice(0, changesStart).concat(mid, suffix);
        } else {
          renderItems = mid.concat(suffix);
        }
      } else {
        // len is not changed, just update
        for (let i = 0; i < newLen; i++) {
          // @ts-ignore
          if (renderItems[i].subj$.__value !== newItems[i]) {
            renderItems[i].subj$(newItems[i]);
          }
        }
      }
      rendering = false;
      prevItems = newItems;
      return renderItems;
    };
  }, []);
  const items = useObervableValue(updateClosure);
  return (
    <>
      {items.map(({ Item, key }) => (
        <Item key={key} />
      ))}
    </>
  );
});