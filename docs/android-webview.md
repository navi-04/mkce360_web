# MKCE 360 in an Android WebView

MKCE 360 is a static web app, so an Android app only has to show it in a `WebView`. This page lists the settings the app
needs, two ways to load it (live site or bundled files), and what to test. Nothing here needs a backend.

The app already adapts to a WebView: it detects `; wv)` in the user agent (or `?embedded=1`) and hides its own
**Full** button, because the Fullscreen API does nothing in a WebView unless the host implements `onShowCustomView`.
Make the Activity itself immersive instead (below).

## What the web app needs from the WebView

| Setting | Value | Why |
| --- | --- | --- |
| JavaScript | on (`settings.javaScriptEnabled = true`) | the whole app is JavaScript |
| DOM storage | on (`settings.domStorageEnabled = true`) | the welcome screen details, the quality choice and "seen" flags live in `localStorage`. Without it the app still works and just forgets everything |
| Hardware acceleration | on (the default; `android:hardwareAccelerated="true"` on the Activity) | WebGL. With software rendering the app falls to a few frames per second |
| WebGL | available on every WebView from Chrome 60 or so (Android 5+ with an updatable WebView). Not a setting | the 3D scene |
| Secure origin | https (the live site) or `WebViewAssetLoader` (below). **Not** `file://` | device motion (Gyro) and some storage behave differently on `file://` |
| Zoom | off (`setSupportZoom(false)`, `builtInZoomControls = false`) | the page already blocks pinch zoom; this avoids the WebView zooming the HUD |
| Overscroll | none (`view.overScrollMode = View.OVER_SCROLL_NEVER`) | pull-to-refresh and rubber banding are blocked in the page too |
| Mixed content / cleartext | not needed; the app loads nothing from other origins | |
| File and content access | off (`allowFileAccess = false`, `allowContentAccess = false`) | not used |

Android permissions: **`android.permission.INTERNET` only**, and only when loading the live site. The optional Gyro look-around
uses the device-orientation API of the WebView; it needs **no** Android permission (iOS asks, Android does not). The app never
asks for location, camera, microphone or storage.

Frame rate: the app starts phones on the "medium" graphics preset (pixel ratio 1.5) and drops a level by itself if it stays
below 30 fps. No WebView setting is needed for that.

## Option A: load the live site (simplest)

Always up to date, no rebuild of the Android app when campus data changes.

```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            overScrollMode = View.OVER_SCROLL_NEVER
            webViewClient = object : WebViewClient() {
                // keep the privacy policy and the app in this WebView, send anything else to the browser
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                    val host = r.url.host ?: return true
                    if (host == "mkce360.nraj.me") return false
                    startActivity(Intent(Intent.ACTION_VIEW, r.url)); return true
                }
                // WebView crashed or was killed to free memory: reload instead of showing a blank screen
                override fun onRenderProcessGone(v: WebView, d: RenderProcessGoneDetail): Boolean {
                    web.reload(); return true
                }
            }
        }
        setContentView(web)
        goImmersive()
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl("https://mkce360.nraj.me/")
    }

    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) goImmersive() }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }

    // the page has its own back handling for sheets; let it use the system back button first
    override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }

    private fun goImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}
```

## Option B: bundle the built files (works offline)

`npm run build` produces `dist/` with a **relative base path**, so it runs from any folder. Copy `dist/` into
`app/src/main/assets/mkce360/` and serve it through `WebViewAssetLoader`, which gives the files a secure
`https://appassets.androidplatform.net/` origin (needed for Gyro and storage):

```kotlin
val loader = WebViewAssetLoader.Builder()
    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
    .build()
web.webViewClient = object : WebViewClient() {
    override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest) = loader.shouldInterceptRequest(r.url)
}
web.loadUrl("https://appassets.androidplatform.net/assets/mkce360/index.html")
```

Dependency: `androidx.webkit:webkit`. The privacy policy page is `mkce360/privacy-policy/index.html` in the same bundle. The
satellite texture (about 280 KB) and the JavaScript (about 770 KB, 200 KB gzipped) are in the bundle, so the first start is fast
and works with no network. Rebuild and re-release the app to update the campus data.

## Orientation, keyboard and fullscreen

* **Portrait first, landscape supported.** Do not lock the orientation. Handle rotation **without recreating the Activity**,
  or the WebGL context is lost and the campus rebuilds:
  `android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|uiMode"`
  on the `<activity>`.
* **Keyboard.** The search field sits in a bottom sheet that follows the visual viewport. Use
  `android:windowSoftInputMode="adjustResize"` so the WebView shrinks when the keyboard opens.
* **Fullscreen.** Use the immersive mode shown above. The page hides its own Full button when it detects a WebView.
* **Cutouts and notches.** The page uses `viewport-fit=cover` and `env(safe-area-inset-*)`. In immersive mode with
  `layoutInDisplayCutoutMode = LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` the insets are reported correctly, so controls stay clear
  of the notch.
* **Back button.** Sheets and the map close from their own buttons; there is no history navigation in the app, so the default back
  action (close the Activity) is right on the home page. Option A above sends back to the previous page only when there is one
  (for example after opening the privacy policy).

## Sensors (Gyro)

The **Gyro** button turns the phone into the look-around controller using `DeviceOrientationEvent`. On Android WebView this
works over https (live site or `WebViewAssetLoader`) with no permission prompt. If the device has no sensor the button hides
itself or shows a message and the drag-to-look controls keep working.

## Release notes for the store listing

* Privacy policy URL: `https://mkce360.nraj.me/privacy-policy`
* Data safety: no data is collected or shared. The optional welcome details (email, college, location) are typed by the user,
  stored only on the device in `localStorage`, and can be cleared in Settings or by clearing app data.
* Permissions requested: `INTERNET` (only for Option A).
* Content: the app shows a model of a real college campus. Positions, sizes and floor counts are first estimates unless a
  building card says otherwise, and the interior of block 1 is sample data. Say so in the listing.

## Test checklist on a real phone

1. Cold start: loader, then the welcome screen (first run only), then the Overview. Note the time to first frame.
2. Rotate to landscape and back during Walk mode: the scene must not reload and the controls must stay reachable.
3. Walk with the joystick and drag-to-look together; run; tap the ground to walk.
4. Gyro: turn the phone; the view must follow without a jump when the button is pressed.
5. Search, directions, **Start guided walk**, pause, take control, arrival, then walk in through the porch of block 1 (no button: just walk), up its stairs and back out.
   **Drive** tab: both thumbs at once (steering arrows and a pedal), into the building and out, rotate the phone while driving, the **Walk** tab to get out.
6. Home button and return: the app resumes (WebGL context restored), details still saved.
7. Airplane mode: Option B works; Option A shows the browser error page, so consider a friendly offline page in the Activity.
8. Open `chrome://inspect` with `WebView.setWebContentsDebuggingEnabled(true)` in a debug build to read the console.
   The frame rate readout is in `?debug=1` (append it to the URL while testing).
