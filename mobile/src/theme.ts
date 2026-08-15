export interface AppColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryPressed: string;
  danger: string;
  shadow: string;
}

export const palette: Record<"light" | "dark", AppColors> = {
  light: {
    background: "#F7F3ED",
    surface: "#FFFFFF",
    surfaceMuted: "#F0E8DE",
    text: "#221B17",
    textMuted: "#73675C",
    border: "#D9CEC2",
    primary: "#126B5B",
    primaryPressed: "#0E594C",
    danger: "#A33A2B",
    shadow: "#1B120B",
  },
  dark: {
    background: "#171412",
    surface: "#231F1C",
    surfaceMuted: "#2F2925",
    text: "#F7F0E8",
    textMuted: "#C4B8AB",
    border: "#4A4038",
    primary: "#5AD0B5",
    primaryPressed: "#43BBA1",
    danger: "#F28B7C",
    shadow: "#000000",
  },
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
} as const;
