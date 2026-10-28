/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		"./index.html",
		"./src/**/*.{js,jsx,ts,tsx}",
		"./components/**/*.{js,jsx,ts,tsx}",
		"./pages/**/*.{js,jsx,ts,tsx}",
		"./hooks/**/*.{js,jsx,ts,tsx}"
	],
	darkMode: ["class"],
	theme: {
		extend: {
			fontFamily: {
				display: ['"Cormorant Garamond"', 'serif'],
				sans: ['"Inter Tight"', 'sans-serif'],
				mono: ['"JetBrains Mono"', 'monospace'],
			},
			colors: {
				obsidian: '#080810',
				accent: '#53B6FF',
				paper: '#FAF8F2',
				error: '#FF4D4D',
				warning: '#FACC15',
				success: '#22C55E',
				panel: "rgba(18, 25, 43, 0.55)",
				stroke: "rgba(122, 168, 255, 0.25)"
			},
			boxShadow: {
				glass: "0 8px 50px rgba(5, 14, 30, 0.55)"
			},
			backdropBlur: {
				xs: "2px"
			}
		}
	},
	plugins: []
};
