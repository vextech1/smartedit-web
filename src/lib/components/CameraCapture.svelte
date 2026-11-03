<script lang="ts">
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

<div class="cam">
  {#if error}<p class="warn">{error}</p>{/if}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} playsinline muted class:hide={!ready}></video>
  <div class="bar">
    <button class="btn" type="button" disabled={!ready} onclick={shoot}>Capture</button>
    <button class="btn small ghost" type="button" onclick={onclose}>Close camera</button>
  </div>
</div>
