<svelte:head><title>Privacy policy | Smart Edit</title><meta name="description" content="How the Smart Edit website handles your files and data: everything runs in your browser and nothing is uploaded." /></svelte:head>
<article class="prose">
<h1>Privacy policy</h1>
<p class="meta">Last updated: November 3, 2026</p>

<p>This policy covers the Smart Edit website and its free tools. In short: the files you choose are processed in your browser on your own device, they are never uploaded, and the site has no accounts, no cookies, no analytics and no ads.</p>

<h2>1. Who we are</h2>
<p>Smart Edit is developed by Vextech. Questions or requests: <strong>{SITE.contactEmail}</strong>.</p>

<h2>2. Your files stay on your device</h2>
<p>Photos, scans, PDFs and the text recognized from them are processed by your browser. They are not sent to our servers or to anyone else. When you download a result, it is saved by your browser, and what you do with it afterwards is up to you.</p>

<h2>3. What we collect</h2>
<p>We do not ask you to sign up, and the website does not use cookies, analytics or advertising. The site is hosted on Google Firebase Hosting, which may keep standard server logs (such as IP address, the pages requested and browser type) for security and to keep the service running. We do not combine these logs with anything else. If you email us, we keep your message and address so that we can reply.</p>

<h2>4. The camera</h2>
<p>The “Scan documents” tool asks your browser for permission to use your camera. The picture stays in your browser: nothing is recorded or sent anywhere. You can decline and add photos from your device instead, and you can withdraw permission at any time in your browser’s site settings.</p>

<h2>5. Saved files (My files)</h2>
<p>If you tap “Save” on a result, a copy is stored in your browser’s own storage (IndexedDB) on this device, under “My files”. It is never uploaded to us or anyone else. So that you can search inside saved PDFs and text files, the words in them are also read on your device and kept in the same browser storage; this text is removed whenever the file is deleted. Scanned PDFs without a text layer can only be found by name. You can rename or delete saved files at any time, deleted files are removed for good after 30 days in the trash, and clearing this site’s data in your browser removes everything.</p>

<h2>6. Offline use and text recognition</h2>
<p>The site uses a service worker to keep its own pages and scripts in your browser so that most tools work offline. The “Extract text” tool reads your images on your device. The first time you use it, your browser downloads the text engine and the data for your chosen language from this website (the same host as the page), then keeps them for next time. No third-party server is contacted, and your images and the text found in them are never sent anywhere.</p>

<h2>7. Who we share information with</h2>
<p>We do not sell or share personal information. Google, as our hosting provider, processes the server logs described above under its own policy: <a href="https://firebase.google.com/support/privacy">Firebase privacy information</a>. Google may process data in countries other than yours.</p>

<h2>8. Your choices and rights</h2>
<p>Depending on where you live, you may have the right to access, correct or delete personal information we hold about you, or to object to some processing. Because the website keeps almost nothing about you, this mostly concerns emails you have sent us. Use the contact address above and we will respond.</p>

<h2>9. Children</h2>
<p>Smart Edit is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child has sent us information, contact us and we will delete it.</p>

<h2>10. Security</h2>
<p>The site is served over HTTPS. Because your files never leave your browser, they are exposed only to the device you are using. No method of storage or transfer is perfectly secure, but we take reasonable care.</p>

<h2>11. Changes</h2>
<p>If we change this policy, we will update the date above. If we add features that collect more information, such as analytics or ads, we will update this page before they go live.</p>
</article>

<script lang="ts">
  import { SITE } from '#lib/site.ts';
</script>
