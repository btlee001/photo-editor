/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // 告诉 Tailwind CSS 在这些文件中查找 Tailwind 类名
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}