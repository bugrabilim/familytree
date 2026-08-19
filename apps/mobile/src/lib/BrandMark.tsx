import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "./theme";

/** Marka simgesi (üç kuşak düğümü) yeşil yuvarlak kutuda. */
export function BrandMark() {
  return (
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={30} height={30} viewBox="0 0 24 24">
        <Path d="M12 22V11M12 11L7.5 7.5M12 11l4.5-3.5" stroke={colors.primaryText} strokeWidth={2} strokeLinecap="round" fill="none" />
        <Circle cx={12} cy={4.5} r={2.6} stroke={colors.primaryText} strokeWidth={2} fill="none" />
        <Circle cx={5.5} cy={9} r={2.4} stroke={colors.primaryText} strokeWidth={2} fill="none" />
        <Circle cx={18.5} cy={9} r={2.4} stroke={colors.primaryText} strokeWidth={2} fill="none" />
      </Svg>
    </View>
  );
}
