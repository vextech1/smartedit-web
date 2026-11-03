<script lang="ts">import { page } from '$app/state';</script>
<svelte:head><title>{page.status === 404 ? 'Page not found' : 'Something went wrong'} | Smart Edit</title><meta name="robots" content="noindex" /></svelte:head>
<h1>{page.status === 404 ? 'That page isn’t here.' : 'Something went wrong.'}</h1>
<p class="lede">Try the free tools or head back to the home page.</p>
<a class="btn" href="/tools">Free tools</a>
