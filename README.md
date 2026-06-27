# Prism

[![Repo Size](https://img.shields.io/github/repo-size/DP1110/prism)](https://github.com/DP1110/prism)
[![License](https://img.shields.io/github/license/DP1110/prism)](https://github.com/DP1110/prism/blob/main/LICENSE)
[![Stars](https://img.shields.io/github/stars/DP1110/prism?style=social)](https://github.com/DP1110/prism/stargazers)

> Prism — for good and aesthetic look

Prism is a lightweight, modern UI/visual toolkit built with JavaScript, CSS, and HTML. It focuses on delivering an elegant, polished appearance and smooth interactions so your projects look good and feel delightful.

Key highlights:
- Clean and minimal design language
- Easy to integrate into existing projects (Vanilla JS/CSS/HTML)
- Theming-ready with CSS variables
- Small footprint and optimized styles

Demo
----

![Prism Demo](https://raw.githubusercontent.com/DP1110/prism/main/assets/screenshot.png)

(If the image doesn't render, add a screenshot at assets/screenshot.png or update the path to your demo GIF.)

Table of Contents
-----------------
- Features
- Installation
- Quick Start
- Usage Examples
- Customization & Theming
- Performance Tips
- Contributing
- License

Features
--------
- Modern, aesthetic UI controls and utilities
- Responsiveness and accessibility-minded defaults
- Simple API surface for rapid adoption
- Customizable CSS variables for colors, spacing, and typography

Installation
------------
Choose the option that fits your workflow.

1) Clone the repository

```bash
git clone https://github.com/DP1110/prism.git
cd prism
```

2) Install dependencies (if the project includes a build system)

```bash
# using npm
npm install

# OR using yarn
yarn install
```

3) Run the development server (if available)

```bash
npm run dev
# or
npm start
```

4) Build for production

```bash
npm run build
```

CDN / Static include

If you prefer to include Prism via static files, add the CSS and JS into your HTML:

```html
<link rel="stylesheet" href="/path/to/prism/dist/prism.css">
<script src="/path/to/prism/dist/prism.js" defer></script>
```

Quick Start
-----------
A bare minimum HTML example to get Prism styling and components working.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Prism Quickstart</title>
  <link rel="stylesheet" href="dist/prism.css">
</head>
<body>
  <header class="prism-header">
    <h1>Prism — for good and aesthetic look</h1>
    <p class="muted">A small UI toolkit focused on beautiful defaults.</p>
  </header>

  <main class="container">
    <button class="prism-btn prism-btn-primary">Primary action</button>
  </main>

  <script src="dist/prism.js" defer></script>
</body>
</html>
```

Usage Examples
--------------
- Buttons, cards, modals, and form controls with consistent spacing and typography
- CSS utilities for layout, spacing, and responsive behavior
- Small JS helpers for progressive enhancement (optional)

Customization & Theming
-----------------------
Prism uses CSS variables so you can theme the entire UI from a few tokens. Example:

```css
:root {
  --prism-bg: #0f1724;
  --prism-surface: #0b1220;
  --prism-accent: #7c5cff;
  --prism-text: #e6eef8;
  --prism-radius: 12px;
}
```

Override these in your own stylesheet or in a theme file to adapt Prism to your project's aesthetic.

Performance Tips
----------------
- Import only the CSS modules you need when possible.
- Minify and compress assets for production.
- Use prefers-reduced-motion media query to disable or simplify animations for better accessibility.

Contributing
------------
We welcome contributions! To contribute:

1. Fork the repository
2. Create a feature branch (git checkout -b feature/your-feature)
3. Make changes and add tests (if applicable)
4. Commit and push your branch
5. Open a Pull Request describing your changes

Code style and guidelines:
- JavaScript: follow modern ES standards
- CSS: use variables for theme tokens and keep components modular

Acknowledgments
---------------
Inspired by a range of modern UI toolkits and the desire to make beautiful, usable defaults easily accessible.

License
-------
This project is licensed under the terms found in the LICENSE file in the repository root.

Contact
-------
Created by DP1110 — contributions, feedback, and improvements welcome.
