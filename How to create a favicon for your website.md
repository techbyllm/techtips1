**How to create a favicon for your website**  
**(How to get an image to appear in the browser tab next to your website name)**

Audience: This article requires rudimentary knowledge of HTML.

To add a favicon to your HTML document, you need to place a **`<link>`** tag within the **`<head>`** section of your page. This tag specifies the image file to be used as the icon. 

**Step-by-Step Guide**

1. **Prepare your favicon image**:  
   * Design a small, square image. Common sizes are 16x16 or 32x32 pixels.  
   * Save it in a compatible format like `.ico`, `.png`, or `.svg`. The `.ico` format is widely supported, but modern browsers also work well with `.png` and `.svg`.  
   * You can use online tools like Favicon.io or Canva to design and generate the necessary files and code snippet.  
2. **Upload the image**:  
   * Upload the favicon image file to your web server. The most common and reliable location is the **root directory** of your website (e.g., in the same folder as your `index.html` file).  
3. **Add the HTML code**:  
   * Open your HTML file and locate the `<head>` section.  
   * Add the following `<link>` tag inside the `<head>` section, adjusting the `href` and `type` attributes to match your file's name and format:

     \<head\>

         \<title\>My Website Title\</title\>

         *\<\!-- Standard favicon link \--\>*

         \<link rel="icon" href="/favicon.ico" type="image/x-icon"\>

     \</head\>

**Best Practices and Options**

* **Use `rel="icon"`**: The official and preferred value for the `rel` attribute is `icon`. The older `rel="shortcut icon"` is a non-conforming legacy value but is still recognized by some older browsers.  
* **Specify multiple sizes for better compatibility**: To ensure your favicon looks good on various devices and platforms, you can provide different sizes using the `sizes` attribute:

  \<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"\>

  \<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"\>

* **Clear browser cache**: If you add the code and the favicon doesn't appear immediately, you may need to clear your browser's cache or open the page in an incognito window, as browsers often cache old favicons. 

