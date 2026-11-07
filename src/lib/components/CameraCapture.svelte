<script lang="ts">
  import FullScreen from './editor/FullScreen.svelte';
  let { onshot, onclose }: { onshot: (c: HTMLCanvasElement) => void; onclose: () => void } = $props();
  let video: HTMLVideoElement;
  let error = $state(''); let ready = $state(false);

  $effect(() => {
    let stream: MediaStream | null = null; let dead = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { error = 'This browser can’t open the camera here. Use “Add photos” instead.'; return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream; await video.play(); ready = true;
      } catch (e) {
        const n = (e as DOMException)?.name;
        error = n === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser’s site settings, or use “Add photos”.'
          : n === 'NotFoundError' ? 'No camera was found. Use “Add photos” instead.' : 'The camera couldn’t start. Use “Add photos” instead.';
      }
    })();
    return () => { dead = true; stream?.getTracks().forEach((t) => t.stop()); };   // always release the camera
  });

  function shoot() {
    const k = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
    const c = document.createElement('canvas'); c.width = Math.round(video.videoWidth * k); c.height = Math.round(video.videoHeight * k);
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height); onshot(c);
  }
</script>

<!-- The camera fills the screen. What you see is the whole frame that Capture keeps. -->
<FullScreen title="Scan" dark {onclose}>
  {#if error}<p class="msg">{error}</p>{/if}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} playsinline muted class:hide={!ready}></video>
  {#snippet footer()}
    <button class="shutter" type="button" aria-label="Capture" disabled={!ready} onclick={shoot}><span></span></button>
    <button class="close" type="button" onclick={onclose}>Close camera</button>
  {/snippet}
</FullScreen>

<style>
  video { flex: 1; min-height: 0; width: 100%; max-width: none; object-fit: contain; border-radius: 0; background: #000; }
  video.hide { display: none; }
  .msg { color: #ffd24a; text-align: center; margin: 24px 8px; }
  .shutter { width: 72px; height: 72px; border-radius: 50%; border: 4px solid #fff; background: none; padding: 5px; cursor: pointer; }
  .shutter span { display: block; width: 100%; height: 100%; border-radius: 50%; background: #fff; }
  .shutter:disabled { opacity: .4; cursor: default; }
  .close { font: inherit; color: #fff; background: none; border: 1px solid #ffffff66; border-radius: 999px; padding: 10px 18px; min-height: 44px; cursor: pointer; }
</style>
