import { configureStore } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector, useStore } from "react-redux";
import documentsReducer from "./documentsSlice";
import notificationsReducer from "./notificationsSlice";
import searchReducer from "./searchSlice";
import uiReducer from "./uiSlice";
import verifyReducer from "./verifySlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      documents: documentsReducer,
      search: searchReducer,
      verify: verifyReducer,
      notifications: notificationsReducer,
      ui: uiReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore = useStore.withTypes<AppStore>();
