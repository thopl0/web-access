# Accessibility fixes — Letters Fonts

Generated 2026-06-20

## /upload

### Form field has no label

Rule: `label`
WCAG: 4.1.2

- `input[type="file"]`

Current:

```html
<input type="file" accept=".ttf,.otf,.woff,.woff2" class="hidden">
```

Should be:

```html
<input aria-label="TODO: describe this field" type="file" accept=".ttf,.otf,.woff,.woff2" class="hidden">
```

> ⚠️ **Needs review** — Replace the placeholder aria-label with a real description of this field.

## /category/calligraphy

### Page language isn't set

Rule: `html-has-lang`
WCAG: 3.1.1

- `html`

Current:

```html
<html><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

Should be:

```html
<html lang="en"><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

## /category/professional

### Page language isn't set

Rule: `html-has-lang`
WCAG: 3.1.1

- `html`

Current:

```html
<html><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

Should be:

```html
<html lang="en"><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

## /font/futura

### Page language isn't set

Rule: `html-has-lang`
WCAG: 3.1.1

- `html`

Current:

```html
<html><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

Should be:

```html
<html lang="en"><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

## /font/itc-officina-sans

### Page language isn't set

Rule: `html-has-lang`
WCAG: 3.1.1

- `html`

Current:

```html
<html><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

Should be:

```html
<html lang="en"><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

## /font/warnock-pro

### Page language isn't set

Rule: `html-has-lang`
WCAG: 3.1.1

- `html`

Current:

```html
<html><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```

Should be:

```html
<html lang="en"><head><title>503 Service Temporarily Unavailable</title></head>
<body>
<center><h1>503 Service Temporarily Unavailable</h1></center>
<hr><center>nginx/1.24.0 (Ubuntu)</center>








</body></html>
```
