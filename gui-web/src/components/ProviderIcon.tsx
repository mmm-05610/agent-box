/**
 * ProviderIcon — render a provider's branded icon.
 *
 * Adapted from cc-switch's ProviderIcon (workspace/cc-switch-study/cc-switch/src/components/ProviderIcon.tsx).
 * Uses inline SVG strings for vector icons (currentColor-aware) and
 * URL-based imports for raster icons (PNG/JPG).
 *
 * Falls back to first-letter avatar if no icon matches.
 */
import { useMemo, type FC } from "react"
import { cn } from "@/lib/utils"
import {
  getIcon,
  getIconMetadata,
  getIconUrl,
  hasIcon,
  isUrlIcon,
} from "@/icons/extracted"

interface ProviderIconProps {
  icon?: string // icon name (looked up in extracted registry)
  name: string // provider name (for fallback initials)
  color?: string // optional override; falls back to metadata.defaultColor
  size?: number | string
  className?: string
  showFallback?: boolean
}

export const ProviderIcon: FC<ProviderIconProps> = ({
  icon,
  name,
  color,
  size = 32,
  className,
  showFallback = true,
}) => {
  const iconSvg = useMemo(() => {
    if (icon && !isUrlIcon(icon) && hasIcon(icon)) {
      return getIcon(icon)
    }
    return ""
  }, [icon])

  const iconUrl = useMemo(() => {
    if (icon && isUrlIcon(icon)) {
      return getIconUrl(icon)
    }
    return ""
  }, [icon])

  const sizeStyle = useMemo(() => {
    const sizeValue = typeof size === "number" ? `${size}px` : size
    return {
      width: sizeValue,
      height: sizeValue,
      fontSize: sizeValue,
      lineHeight: 1,
    }
  }, [size])

  const effectiveColor = useMemo(() => {
    if (color && typeof color === "string" && color.trim() !== "") {
      return color
    }
    if (icon) {
      const metadata = getIconMetadata(icon)
      if (metadata?.defaultColor && metadata.defaultColor !== "currentColor") {
        return metadata.defaultColor
      }
    }
    return undefined
  }, [color, icon])

  if (iconSvg) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0",
          className,
        )}
        title={name}
        style={{ ...sizeStyle, color: effectiveColor }}
        dangerouslySetInnerHTML={{ __html: iconSvg }}
      />
    )
  }

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={name}
        title={name}
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0 object-contain",
          className,
        )}
        style={{ width: sizeStyle.width, height: sizeStyle.height }}
        loading="lazy"
      />
    )
  }

  if (showFallback) {
    const initials = name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
    const fallbackFontSize =
      typeof size === "number" ? `${Math.max(size * 0.5, 12)}px` : "0.5em"
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center flex-shrink-0 rounded-lg",
          "bg-muted text-muted-foreground font-semibold",
          className,
        )}
        title={name}
        style={sizeStyle}
      >
        <span style={{ fontSize: fallbackFontSize }}>{initials}</span>
      </span>
    )
  }

  return null
}