"use client";

import React from "react";

interface State {
  openSidenav: boolean;
  sidenavColor: string;
  sidenavType: string;
  transparentNavbar: boolean;
  fixedNavbar: boolean;
  openConfigurator: boolean;
  sidenavCollapsed: boolean;
}

type Action =
  | { type: "OPEN_SIDENAV"; value: boolean }
  | { type: "SIDENAV_TYPE"; value: string }
  | { type: "SIDENAV_COLOR"; value: string }
  | { type: "TRANSPARENT_NAVBAR"; value: boolean }
  | { type: "FIXED_NAVBAR"; value: boolean }
  | { type: "OPEN_CONFIGURATOR"; value: boolean }
  | { type: "SIDENAV_COLLAPSED"; value: boolean };

type ContextType = [State, React.Dispatch<Action>];

const STORAGE_KEY = "qiqi-dashboard-config";

// Load settings from localStorage
const loadSettings = (): Partial<State> => {
  if (typeof window === "undefined") {
    return {};
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error loading settings from localStorage:", error);
  }
  
  return {};
};

// Save settings to localStorage
const saveSettings = (newSettings: Partial<State>) => {
  if (typeof window === "undefined") {
    return;
  }
  
  try {
    // Load existing settings and merge with new ones
    const existing = loadSettings();
    const merged = { ...existing, ...newSettings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.error("Error saving settings to localStorage:", error);
  }
};

const defaultState: State = {
  openSidenav: false,
  sidenavColor: "dark",
  sidenavType: "white",
  transparentNavbar: true,
  fixedNavbar: false,
  openConfigurator: false,
  sidenavCollapsed: false,
};

const loadedSettings = loadSettings();
const initialState: State = {
  ...defaultState,
  ...loadedSettings,
  // These should not be persisted (UI state only)
  openSidenav: false,
  openConfigurator: false,
};

export const MaterialTailwind = React.createContext<ContextType>([
  initialState,
  () => {},
]);
MaterialTailwind.displayName = "MaterialTailwindContext";

export function reducer(state: State, action: Action): State {
  let newState: State;
  
  switch (action.type) {
    case "OPEN_SIDENAV": {
      newState = { ...state, openSidenav: action.value };
      break;
    }
    case "SIDENAV_TYPE": {
      newState = { ...state, sidenavType: action.value };
      // Save to localStorage
      saveSettings({ sidenavType: action.value });
      break;
    }
    case "SIDENAV_COLOR": {
      newState = { ...state, sidenavColor: action.value };
      // Save to localStorage
      saveSettings({ sidenavColor: action.value });
      break;
    }
    case "TRANSPARENT_NAVBAR": {
      newState = { ...state, transparentNavbar: action.value };
      // Save to localStorage
      saveSettings({ transparentNavbar: action.value });
      break;
    }
    case "FIXED_NAVBAR": {
      newState = { ...state, fixedNavbar: action.value };
      // Save to localStorage
      saveSettings({ fixedNavbar: action.value });
      break;
    }
    case "OPEN_CONFIGURATOR": {
      newState = { ...state, openConfigurator: action.value };
      break;
    }
    case "SIDENAV_COLLAPSED": {
      newState = { ...state, sidenavCollapsed: action.value };
      // Save to localStorage
      saveSettings({ sidenavCollapsed: action.value });
      break;
    }
    default: {
      throw new Error("Unhandled action type");
    }
  }
  
  return newState;
}

export function MaterialTailwindControllerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [controller, dispatch] = React.useReducer(reducer, initialState);

  const value: ContextType = React.useMemo(
    () => [controller, dispatch],
    [controller, dispatch]
  );

  return (
    <MaterialTailwind.Provider value={value}>
      {children}
    </MaterialTailwind.Provider>
  );
}

export function useMaterialTailwindController() {
  const context = React.useContext(MaterialTailwind);

  if (!context) {
    throw new Error(
      "useMaterialTailwindController should be used inside the MaterialTailwindControllerProvider."
    );
  }

  return context;
}

MaterialTailwindControllerProvider.displayName = "/src/context/index.jsx";

export const setOpenSidenav = (
  dispatch: React.Dispatch<Action>,
  value: boolean
) => dispatch({ type: "OPEN_SIDENAV", value });
export const setSidenavType = (
  dispatch: React.Dispatch<Action>,
  value: string
) => dispatch({ type: "SIDENAV_TYPE", value });
export const setSidenavColor = (
  dispatch: React.Dispatch<Action>,
  value: string
) => dispatch({ type: "SIDENAV_COLOR", value });
export const setTransparentNavbar = (
  dispatch: React.Dispatch<Action>,
  value: boolean
) => dispatch({ type: "TRANSPARENT_NAVBAR", value });
export const setFixedNavbar = (
  dispatch: React.Dispatch<Action>,
  value: boolean
) => dispatch({ type: "FIXED_NAVBAR", value });
export const setOpenConfigurator = (
  dispatch: React.Dispatch<Action>,
  value: boolean
) => dispatch({ type: "OPEN_CONFIGURATOR", value });
export const setSidenavCollapsed = (
  dispatch: React.Dispatch<Action>,
  value: boolean
) => dispatch({ type: "SIDENAV_COLLAPSED", value });
