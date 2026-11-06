/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 全部走 CSS 变量（RGB 三元组）
        ink: {
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
        },
        fg: {
          DEFAULT: "rgb(var(--fg) / <alpha-value>)",
          dim: "rgb(var(--fg-dim) / <alpha-value>)",
          mute: "rgb(var(--fg-mute) / <alpha-value>)",
        },
        accent: {
          green: "rgb(var(--accent-green) / <alpha-value>)",
          greenSoft: "rgb(var(--accent-green-soft) / <alpha-value>)",
          orange: "rgb(var(--accent-orange) / <alpha-value>)",
          orangeSoft: "rgb(var(--accent-orange-soft) / <alpha-value>)",
          blue: "rgb(var(--accent-blue) / <alpha-value>)",
          red: "rgb(var(--accent-red) / <alpha-value>)",
        },
      },
      fontFamily: {
        // fp-font 由设置里的"编辑器字体"实时写进来，整块界面的等宽文字跟着一起变
        mono: ["var(--fp-font, Consolas)", "Consolas", "Menlo", "monospace"],
        sans: ["Segoe UI", "Microsoft YaHei UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};
