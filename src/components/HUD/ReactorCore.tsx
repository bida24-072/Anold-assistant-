import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { HUD_THEME } from "@/config/constants";
import { AssistantStatus } from "@/types";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ReactorCoreProps {
  status: AssistantStatus;
  size?: number;
}

function statusToColor(status: AssistantStatus): string {
  switch (status) {
    case "recording":
    case "transcribing":
      return HUD_THEME.colors.accentAmber;
    case "thinking":
    case "executing_tool":
      return HUD_THEME.colors.reactorCore;
    case "speaking":
      return HUD_THEME.colors.success;
    case "error":
      return HUD_THEME.colors.danger;
    default:
      return HUD_THEME.colors.reactorCoreDim;
  }
}

export function ReactorCore({ status, size = 220 }: ReactorCoreProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const active = status !== "idle";

  useEffect(() => {
    const rotateLoop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: active ? 4000 : 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotateLoop.start();
    return () => rotateLoop.stop();
  }, [active, rotation]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: active ? 550 : 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: active ? 550 : 1800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [active, pulse]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] });
  const color = statusToColor(status);
  const radius = size * 0.32;
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.glow, { opacity: glowOpacity, backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]} />

      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Defs>
            <RadialGradient id="coreGradient" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.9} />
              <Stop offset="70%" stopColor={color} stopOpacity={0.25} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Outer ring segments */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * 2 * Math.PI;
            const x1 = center + Math.cos(angle) * (radius + 20);
            const y1 = center + Math.sin(angle) * (radius + 20);
            const x2 = center + Math.cos(angle) * (radius + 34);
            const y2 = center + Math.sin(angle) * (radius + 34);
            return (
              <Circle
                key={i}
                cx={(x1 + x2) / 2}
                cy={(y1 + y2) / 2}
                r={2}
                fill={color}
                opacity={0.7}
              />
            );
          })}

          <Circle cx={center} cy={center} r={radius + 24} stroke={color} strokeWidth={1} fill="none" opacity={0.3} />
          <Circle cx={center} cy={center} r={radius + 10} stroke={color} strokeWidth={1.5} fill="none" opacity={0.5} />
        </Svg>
      </Animated.View>

      <Animated.View
        style={[
          styles.core,
          {
            width: radius * 2,
            height: radius * 2,
            borderRadius: radius,
            backgroundColor: color,
            transform: [{ scale }],
            shadowColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
  },
  core: {
    position: "absolute",
    shadowOpacity: 0.9,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
    elevation: 20,
  },
});
