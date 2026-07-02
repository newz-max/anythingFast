<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, watchEffect } from 'vue'
import { darkTheme, zhCN, dateZhCN } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()
const systemPrefersDark = shallowRef(false)

const resolvedTheme = computed<'dark' | 'light'>(() => {
  const preference = taskStore.settings.theme
  return preference === 'dark' || (preference === 'system' && systemPrefersDark.value) ? 'dark' : 'light'
})

const theme = computed(() => resolvedTheme.value === 'dark' ? darkTheme : undefined)

const scrollbarWidth = '7px'
const scrollbarHeight = '7px'
const scrollbarBorderRadius = '999px'
const scrollbarRailColor = 'transparent'

const themeOverrides = computed<GlobalThemeOverrides>(() => {
  const dark = resolvedTheme.value === 'dark'
  const scrollbarColor = dark ? 'rgba(87, 100, 128, 0.8)' : 'rgba(87, 100, 128, 0.48)'
  const scrollbarColorHover = dark ? 'rgba(101, 116, 148, 0.9)' : 'rgba(87, 100, 128, 0.64)'
  const panelColor = dark ? 'rgba(20, 27, 47, 0.96)' : '#ffffff'
  const fieldColor = dark ? 'rgba(25, 32, 54, 0.72)' : '#f8fbff'
  const fieldColorFocus = dark ? 'rgba(29, 38, 65, 0.86)' : '#ffffff'
  const borderColor = dark ? 'rgba(74, 91, 132, 0.54)' : 'rgba(130, 148, 184, 0.42)'
  const borderColorHover = dark ? 'rgba(91, 116, 178, 0.76)' : 'rgba(74, 117, 224, 0.56)'
  const primaryColor = '#3d78fd'
  const primaryColorHover = '#4d87ff'
  const primaryColorPressed = '#3468e8'
  const textColor = dark ? '#f4f7ff' : '#172033'
  const mutedTextColor = dark ? '#9ba8cc' : '#64708a'
  const placeholderColor = dark ? '#6f7a99' : '#9aa6bd'
  const disabledColor = dark ? 'rgba(30, 38, 60, 0.76)' : '#eef2f8'

  return {
    common: {
      primaryColor,
      primaryColorHover,
      primaryColorPressed,
      primaryColorSuppl: primaryColorHover,
      borderRadius: '10px',
      borderRadiusSmall: '8px',
      heightMedium: '44px',
      fontSize: '14px',
      fontSizeMedium: '14px',
      textColorBase: textColor,
      textColor1: textColor,
      textColor2: mutedTextColor,
      textColor3: placeholderColor,
      placeholderColor,
      dividerColor: dark ? 'rgba(59, 73, 105, 0.64)' : 'rgba(205, 214, 232, 0.84)',
      borderColor,
      closeIconColor: dark ? '#aeb8d9' : '#687594',
      closeIconColorHover: textColor,
      scrollbarColor,
      scrollbarColorHover,
      scrollbarWidth,
      scrollbarHeight,
      scrollbarBorderRadius
    },
    Drawer: {
      color: panelColor,
      textColor,
      titleTextColor: textColor,
      titleFontSize: '20px',
      titleFontWeight: '800',
      borderRadius: '0',
      bodyPadding: '30px 24px 20px',
      headerPadding: '26px 24px 12px',
      footerPadding: '22px 24px 24px',
      headerBorderBottom: '0 solid transparent',
      footerBorderTop: `1px solid ${dark ? 'rgba(61, 76, 109, 0.66)' : 'rgba(210, 219, 237, 0.9)'}`,
      closeSize: '34px',
      closeIconSize: '20px',
      closeBorderRadius: '8px',
      closeColorHover: dark ? 'rgba(78, 95, 137, 0.34)' : 'rgba(229, 235, 247, 0.9)',
      boxShadow: dark ? '-18px 0 50px rgba(0, 0, 0, 0.34)' : '-18px 0 48px rgba(32, 48, 78, 0.16)'
    },
    Form: {
      labelTextColor: textColor,
      asteriskColor: '#ff6f8f',
      labelFontWeight: '800',
      labelFontSizeTopMedium: '15px',
      labelHeightMedium: '26px',
      labelPaddingVertical: '0 0 8px 0',
      feedbackTextColor: mutedTextColor
    },
    Input: {
      heightMedium: '44px',
      borderRadius: '8px',
      color: fieldColor,
      colorFocus: fieldColorFocus,
      colorDisabled: disabledColor,
      textColor,
      textColorDisabled: dark ? '#7783a2' : '#97a2b7',
      placeholderColor,
      placeholderColorDisabled: placeholderColor,
      border: `1px solid ${borderColor}`,
      borderHover: `1px solid ${borderColorHover}`,
      borderFocus: `1px solid ${borderColorHover}`,
      borderDisabled: `1px solid ${dark ? 'rgba(66, 78, 111, 0.4)' : 'rgba(203, 211, 228, 0.7)'}`,
      boxShadowFocus: `0 0 0 2px ${dark ? 'rgba(61, 120, 253, 0.14)' : 'rgba(61, 120, 253, 0.12)'}`,
      caretColor: primaryColor,
      countTextColor: placeholderColor,
      paddingMedium: '0 14px',
      lineHeightTextarea: '1.55'
    },
    InputNumber: {
      peers: {
        Input: {
          heightMedium: '44px',
          borderRadius: '8px',
          color: fieldColor,
          colorFocus: fieldColorFocus,
          textColor,
          placeholderColor,
          border: `1px solid ${borderColor}`,
          borderHover: `1px solid ${borderColorHover}`,
          borderFocus: `1px solid ${borderColorHover}`,
          boxShadowFocus: `0 0 0 2px ${dark ? 'rgba(61, 120, 253, 0.14)' : 'rgba(61, 120, 253, 0.12)'}`
        }
      }
    },
    Select: {
      menuBoxShadow: dark ? '0 18px 44px rgba(0, 0, 0, 0.32)' : '0 18px 42px rgba(32, 48, 78, 0.14)',
      peers: {
        InternalSelection: {
          heightMedium: '44px',
          borderRadius: '8px',
          color: fieldColor,
          colorActive: fieldColorFocus,
          textColor,
          placeholderColor,
          border: `1px solid ${borderColor}`,
          borderHover: `1px solid ${borderColorHover}`,
          borderActive: `1px solid ${borderColorHover}`,
          borderFocus: `1px solid ${borderColorHover}`,
          boxShadowFocus: `0 0 0 2px ${dark ? 'rgba(61, 120, 253, 0.14)' : 'rgba(61, 120, 253, 0.12)'}`,
          boxShadowActive: `0 0 0 2px ${dark ? 'rgba(61, 120, 253, 0.1)' : 'rgba(61, 120, 253, 0.1)'}`,
          arrowColor: dark ? '#8d99ba' : '#6a7690',
          paddingSingle: '0 14px'
        },
        InternalSelectMenu: {
          borderRadius: '10px',
          color: dark ? 'rgba(24, 31, 52, 0.98)' : '#ffffff',
          optionTextColor: textColor,
          optionTextColorActive: textColor,
          optionColorPending: dark ? 'rgba(61, 120, 253, 0.14)' : 'rgba(61, 120, 253, 0.08)',
          optionColorActive: dark ? 'rgba(61, 120, 253, 0.2)' : 'rgba(61, 120, 253, 0.12)',
          optionCheckColor: primaryColor,
          actionDividerColor: dark ? 'rgba(61, 76, 109, 0.66)' : 'rgba(210, 219, 237, 0.9)'
        }
      }
    },
    Button: {
      heightMedium: '42px',
      borderRadiusMedium: '9px',
      fontWeight: '800',
      textColor: textColor,
      textColorHover: textColor,
      textColorPressed: textColor,
      textColorDisabled: dark ? '#66708d' : '#9aa5ba',
      color: dark ? 'rgba(17, 23, 42, 0.58)' : '#ffffff',
      colorHover: dark ? 'rgba(31, 42, 68, 0.78)' : '#f8fbff',
      colorPressed: dark ? 'rgba(22, 30, 51, 0.9)' : '#edf3ff',
      colorDisabled: disabledColor,
      border: `1px solid ${borderColor}`,
      borderHover: `1px solid ${borderColorHover}`,
      borderPressed: `1px solid ${borderColorHover}`,
      borderDisabled: `1px solid ${dark ? 'rgba(66, 78, 111, 0.34)' : 'rgba(203, 211, 228, 0.72)'}`,
      textColorPrimary: '#ffffff',
      textColorHoverPrimary: '#ffffff',
      textColorPressedPrimary: '#ffffff',
      colorPrimary: primaryColor,
      colorHoverPrimary: primaryColorHover,
      colorPressedPrimary: primaryColorPressed,
      borderPrimary: '1px solid transparent',
      borderHoverPrimary: '1px solid transparent',
      borderPressedPrimary: '1px solid transparent',
      rippleColorPrimary: primaryColor
    },
    Switch: {
      railColor: dark ? 'rgba(51, 62, 91, 0.8)' : 'rgba(204, 214, 232, 0.88)',
      railColorActive: primaryColor,
      buttonColor: '#ffffff',
      buttonBoxShadow: '0 6px 12px rgba(0, 0, 0, 0.22)',
      railHeightMedium: '30px',
      railWidthMedium: '56px',
      buttonHeightMedium: '24px',
      buttonWidthMedium: '24px',
      buttonWidthPressedMedium: '28px'
    },
    Tag: {
      borderRadius: '999px',
      color: dark ? 'rgba(62, 80, 130, 0.42)' : 'rgba(61, 120, 253, 0.1)',
      textColor: dark ? '#c9d5ff' : '#2d5fd8',
      border: '1px solid transparent'
    },
    Steps: {
      indicatorColorProcess: primaryColor,
      indicatorBorderColorProcess: primaryColor,
      headerTextColorProcess: textColor,
      headerTextColorWait: mutedTextColor,
      splitorColorWait: dark ? 'rgba(64, 78, 112, 0.66)' : 'rgba(202, 211, 230, 0.9)'
    },
    Card: {
      color: dark ? 'rgba(27, 35, 55, 0.86)' : '#ffffff',
      colorEmbedded: dark ? 'rgba(27, 35, 55, 0.72)' : '#f8fbff',
      textColor,
      titleTextColor: textColor,
      borderColor: dark ? 'rgba(82, 106, 171, 0.18)' : 'rgba(210, 219, 237, 0.9)',
      borderRadius: '10px'
    },
    Scrollbar: {
      color: scrollbarColor,
      colorHover: scrollbarColorHover,
      width: scrollbarWidth,
      height: scrollbarHeight,
      borderRadius: scrollbarBorderRadius,
      railColor: scrollbarRailColor
    }
  }
})

let mediaQuery: MediaQueryList | null = null

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  systemPrefersDark.value = mediaQuery.matches
  mediaQuery.addEventListener('change', updateSystemTheme)
})

onUnmounted(() => {
  mediaQuery?.removeEventListener('change', updateSystemTheme)
})

watchEffect(() => {
  document.documentElement.dataset.appTheme = resolvedTheme.value
})

function updateSystemTheme(event: MediaQueryListEvent) {
  systemPrefersDark.value = event.matches
}
</script>

<template>
  <NConfigProvider :theme="theme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NDialogProvider>
      <NMessageProvider>
        <NNotificationProvider>
          <slot />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
