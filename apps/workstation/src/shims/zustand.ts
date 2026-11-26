// Vendored MIT core from vendor/ring1-refs/zustand/src/ (pmndrs/zustand, MIT)
import React from 'react';

type SetStateInternal<T> = {
  _(partial: T | Partial<T> | { _(state: T): T | Partial<T> }['_'], replace?: false): void;
  _(state: T | { _(state: T): T }['_'], replace: true): void;
}['_'];

export interface StoreApi<T> {
  setState: SetStateInternal<T>;
  getState: () => T;
  getInitialState: () => T;
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
}

export type StateCreator<T> = (
  setState: StoreApi<T>['setState'],
  getState: StoreApi<T>['getState'],
  store: StoreApi<T>
) => T;

export function createStore<T>(createState: StateCreator<T>): StoreApi<T> {
  let state: T;
  const listeners = new Set<(state: T, prevState: T) => void>();

  const setState: StoreApi<T>['setState'] = (partial: unknown, replace?: boolean) => {
    const nextState = typeof partial === 'function' ? (partial as (s: T) => T | Partial<T>)(state) : partial;
    if (!Object.is(nextState, state)) {
      const previousState = state;
      state =
        replace ?? (typeof nextState !== 'object' || nextState === null)
          ? (nextState as T)
          : Object.assign({}, state, nextState);
      listeners.forEach((listener) => listener(state, previousState));
    }
  };

  const getState: StoreApi<T>['getState'] = () => state;
  const getInitialState: StoreApi<T>['getInitialState'] = () => initialState;
  const subscribe: StoreApi<T>['subscribe'] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api: StoreApi<T> = { setState, getState, getInitialState, subscribe };
  const initialState = (state = createState(setState, getState, api));
  return api;
}

const identity = <T,>(arg: T): T => arg;

export function useStore<TState, StateSlice = TState>(
  api: StoreApi<TState>,
  selector: (state: TState) => StateSlice = identity as unknown as (state: TState) => StateSlice
): StateSlice {
  const slice = React.useSyncExternalStore(
    api.subscribe,
    React.useCallback(() => selector(api.getState()), [api, selector]),
    () => selector(api.getInitialState())
  );
  React.useDebugValue(slice);
  return slice;
}

export type UseBoundStore<S extends StoreApi<unknown>> = {
  (): S extends StoreApi<infer T> ? T : never;
  <U>(selector: (state: S extends StoreApi<infer T> ? T : never) => U): U;
} & S;

export function create<T>(createState: StateCreator<T>): UseBoundStore<StoreApi<T>> {
  const api = createStore(createState);
  const useBoundStore = ((selector?: (s: T) => unknown) => useStore(api, selector)) as unknown as UseBoundStore<
    StoreApi<T>
  >;
  Object.assign(useBoundStore, api);
  return useBoundStore;
}
