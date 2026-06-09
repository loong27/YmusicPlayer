package com.ymusicplayerandroid.player

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.ymusicplayerandroid.MainActivity

class MusicPlaybackService : MediaSessionService() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var mediaSession: MediaSession? = null

  private val releaseWhenIdle = Runnable {
    val player = mediaSession?.player ?: return@Runnable
    if (player.playbackState == Player.STATE_IDLE && !player.playWhenReady && player.mediaItemCount == 0) {
      stopSelf()
    }
  }

  private val listener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      scheduleIdleRelease()
    }

    override fun onPlaybackStateChanged(playbackState: Int) {
      scheduleIdleRelease()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      scheduleIdleRelease()
    }
  }

  override fun onCreate() {
    super.onCreate()
    val player = PlaybackHolder.getOrCreatePlayer(this)
    player.addListener(listener)
    mediaSession = MediaSession.Builder(this, player)
      .setSessionActivity(createSessionActivity())
      .build()
    PlaybackHolder.emitDiagnostic("mediaSessionReady") {
      put("mediaSessionController", packageName)
      put("command", "sessionCreated")
    }
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
    PlaybackHolder.emitDiagnostic("mediaSessionControllerConnected") {
      put("mediaSessionController", controllerInfo.packageName)
    }
    return mediaSession
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = mediaSession?.player
    if (player == null || (player.playbackState == Player.STATE_IDLE && !player.playWhenReady && player.mediaItemCount == 0)) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(releaseWhenIdle)
    val shouldReleasePlayer = mediaSession?.player?.let {
      it.playbackState == Player.STATE_IDLE && !it.playWhenReady && it.mediaItemCount == 0
    } ?: true
    mediaSession?.run {
      player.removeListener(listener)
      release()
    }
    mediaSession = null
    if (shouldReleasePlayer) {
      PlaybackHolder.clear()
    }
    super.onDestroy()
  }

  private fun scheduleIdleRelease() {
    mainHandler.removeCallbacks(releaseWhenIdle)
    val player = mediaSession?.player ?: return
    if (player.playbackState == Player.STATE_IDLE && !player.playWhenReady && player.mediaItemCount == 0) {
      mainHandler.postDelayed(releaseWhenIdle, IDLE_RELEASE_DELAY_MS)
    }
  }

  private fun createSessionActivity(): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    return PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    private const val IDLE_RELEASE_DELAY_MS = 300_000L
  }
}

data class PlaybackComfortConfig(
  val audioFocusDuckOnTransient: Boolean = true,
  val audioFocusPauseOnLoss: Boolean = true,
  val audioFocusResumeAfterGain: Boolean = true,
  val bluetoothAutoResumeOnReconnect: Boolean = true,
  val bluetoothAutoResumeWindowMs: Long = 300_000L,
)

object PlaybackHolder {
  private const val DUCK_VOLUME = 0.25f
  private const val FULL_VOLUME = 1.0f

  private val mainHandler = Handler(Looper.getMainLooper())
  private var player: ExoPlayer? = null
  private var appContext: Context? = null
  private var audioManager: AudioManager? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var deviceCallbackRegistered = false
  private var noisyReceiverRegistered = false
  private var hasPrivateRoute = false
  private var config = PlaybackComfortConfig()
  private var diagnosticSink: ((String, Map<String, Any?>) -> Unit)? = null
  private var pausedByAudioFocusLoss = false
  private var pausedByRouteLoss = false
  private var pausedRouteMediaId: String? = null
  private var pausedRouteAtMs = 0L
  private var userPaused = false

  private val evaluateRouteRunnable = Runnable { evaluateRouteChange("delayedAdded") }

  private val audioFocusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
    val currentPlayer = player ?: return@OnAudioFocusChangeListener
    when (focusChange) {
      AudioManager.AUDIOFOCUS_GAIN -> {
        currentPlayer.volume = FULL_VOLUME
        emitDiagnostic("audioFocusChanged") {
          put("audioFocusChange", "gain")
        }
        if (pausedByAudioFocusLoss && config.audioFocusResumeAfterGain && !userPaused && currentPlayer.mediaItemCount > 0) {
          pausedByAudioFocusLoss = false
          currentPlayer.play()
          emitDiagnostic("audioFocusAutoResume") {
            put("audioFocusChange", "gain")
          }
        } else {
          pausedByAudioFocusLoss = false
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
        emitDiagnostic("audioFocusChanged") {
          put("audioFocusChange", "lossTransientCanDuck")
        }
        if (config.audioFocusDuckOnTransient) {
          currentPlayer.volume = DUCK_VOLUME
        } else if (currentPlayer.isPlaying && config.audioFocusPauseOnLoss) {
          pausedByAudioFocusLoss = true
          currentPlayer.pause()
        }
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        emitDiagnostic("audioFocusChanged") {
          put("audioFocusChange", "lossTransient")
        }
        if (currentPlayer.isPlaying && config.audioFocusPauseOnLoss) {
          pausedByAudioFocusLoss = true
          currentPlayer.pause()
        }
      }
      AudioManager.AUDIOFOCUS_LOSS -> {
        emitDiagnostic("audioFocusChanged") {
          put("audioFocusChange", "loss")
        }
        pausedByAudioFocusLoss = false
        if (config.audioFocusPauseOnLoss) {
          currentPlayer.pause()
        }
        abandonAudioFocus()
      }
    }
  }

  private val noisyReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
        mainHandler.post { handleRouteLoss("becomingNoisy") }
      }
    }
  }

  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      mainHandler.removeCallbacks(evaluateRouteRunnable)
      mainHandler.postDelayed(evaluateRouteRunnable, 300L)
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      mainHandler.post { evaluateRouteChange("removed") }
    }
  }

  fun getOrCreatePlayer(context: Context): ExoPlayer {
    val appCtx = context.applicationContext
    appContext = appContext ?: appCtx
    audioManager = audioManager ?: appCtx.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    registerDeviceCallback()
    registerNoisyReceiver()
    return player ?: ExoPlayer.Builder(appCtx).build().also {
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build()
      it.setAudioAttributes(audioAttributes, false)
      it.setHandleAudioBecomingNoisy(true)
      it.setWakeMode(C.WAKE_MODE_LOCAL)
      it.repeatMode = Player.REPEAT_MODE_OFF
      player = it
      hasPrivateRoute = hasBluetoothOrWiredRoute()
    }
  }

  fun setDiagnosticSink(sink: ((String, Map<String, Any?>) -> Unit)?) {
    diagnosticSink = sink
  }

  fun configure(nextConfig: PlaybackComfortConfig) {
    config = nextConfig
    emitDiagnostic("playbackComfortConfigured") {
      put("audioFocusChange", "configured")
      put("bluetoothAutoResumeOnReconnect", config.bluetoothAutoResumeOnReconnect)
      put("bluetoothAutoResumeWindowMs", config.bluetoothAutoResumeWindowMs)
    }
  }

  fun prepareForPlay(): Boolean {
    userPaused = false
    val focusGranted = requestAudioFocus()
    if (!focusGranted) {
      emitDiagnostic("audioFocusRequestFailed") {
        put("audioFocusChange", "requestFailed")
      }
    }
    return focusGranted
  }

  fun markManualPause() {
    userPaused = true
    pausedByAudioFocusLoss = false
    pausedByRouteLoss = false
    abandonAudioFocus()
  }

  fun markStopped() {
    userPaused = true
    pausedByAudioFocusLoss = false
    pausedByRouteLoss = false
    abandonAudioFocus()
  }

  fun emitDiagnostic(type: String, extras: MutableMap<String, Any?>.() -> Unit = {}) {
    try {
      val data = mutableMapOf<String, Any?>("type" to type)
      try {
        extras(data)
      } catch (error: Exception) {
        data["extrasError"] = error.javaClass.simpleName
      }
      diagnosticSink?.invoke(type, data)
    } catch (ignored: Exception) { }
  }

  fun clear() {
    abandonAudioFocus()
    mainHandler.removeCallbacks(evaluateRouteRunnable)
    unregisterDeviceCallback()
    unregisterNoisyReceiver()
    player?.release()
    player = null
    pausedByAudioFocusLoss = false
    pausedByRouteLoss = false
    pausedRouteMediaId = null
    pausedRouteAtMs = 0L
    userPaused = true
  }

  private fun requestAudioFocus(): Boolean {
    val manager = audioManager ?: return true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val attributes = android.media.AudioAttributes.Builder()
        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
        .build()
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(attributes)
        .setAcceptsDelayedFocusGain(false)
        .setOnAudioFocusChangeListener(audioFocusChangeListener, mainHandler)
        .setWillPauseWhenDucked(!config.audioFocusDuckOnTransient)
        .build()
      audioFocusRequest = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(audioFocusChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN)
    }
    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonAudioFocus() {
    val manager = audioManager ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
      audioFocusRequest = null
    } else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(audioFocusChangeListener)
    }
  }

  private fun registerDeviceCallback() {
    val manager = audioManager ?: return
    if (!deviceCallbackRegistered) {
      try {
        manager.registerAudioDeviceCallback(audioDeviceCallback, mainHandler)
        deviceCallbackRegistered = true
      } catch (error: Exception) {
        emitDiagnostic("audioDeviceCallbackRegisterFailed") {
          put("exception", error.javaClass.simpleName)
        }
      }
    }
  }

  private fun unregisterDeviceCallback() {
    val manager = audioManager ?: return
    if (deviceCallbackRegistered) {
      try {
        manager.unregisterAudioDeviceCallback(audioDeviceCallback)
      } catch (ignored: Exception) { }
      deviceCallbackRegistered = false
    }
  }

  private fun registerNoisyReceiver() {
    val context = appContext ?: return
    if (!noisyReceiverRegistered) {
      try {
        context.registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
        noisyReceiverRegistered = true
      } catch (error: Exception) {
        emitDiagnostic("noisyReceiverRegisterFailed") {
          put("exception", error.javaClass.simpleName)
        }
      }
    }
  }

  private fun unregisterNoisyReceiver() {
    val context = appContext ?: return
    if (noisyReceiverRegistered) {
      try {
        context.unregisterReceiver(noisyReceiver)
      } catch (ignored: Exception) { }
      noisyReceiverRegistered = false
    }
  }

  private fun evaluateRouteChange(reason: String) {
    try {
      val currentPlayer = player ?: return
      val hasRoute = hasBluetoothOrWiredRoute()
      if (hasPrivateRoute && !hasRoute) {
        handleRouteLoss(reason)
      } else if (!hasPrivateRoute && hasRoute) {
        emitDiagnostic("audioRouteChanged") {
          put("audioRouteEvent", "privateRouteConnected")
          put("routeType", routeTypeName())
          put("reason", reason)
        }
        maybeResumeAfterRouteReconnect(currentPlayer)
      }
      hasPrivateRoute = hasRoute
    } catch (error: Exception) {
      emitDiagnostic("audioRouteChangeFailed") {
        put("reason", reason)
        put("exception", error.javaClass.simpleName)
      }
    }
  }

  private fun handleRouteLoss(reason: String) {
    val currentPlayer = player ?: return
    if (currentPlayer.isPlaying) {
      pausedByRouteLoss = true
      pausedRouteMediaId = currentPlayer.currentMediaItem?.mediaId
      pausedRouteAtMs = System.currentTimeMillis()
      userPaused = false
      currentPlayer.pause()
    }
    hasPrivateRoute = false
    emitDiagnostic("audioRouteChanged") {
      put("audioRouteEvent", "privateRouteLost")
      put("routeType", "speaker")
      put("reason", reason)
    }
  }

  private fun maybeResumeAfterRouteReconnect(currentPlayer: ExoPlayer) {
    if (!config.bluetoothAutoResumeOnReconnect || !pausedByRouteLoss || userPaused || currentPlayer.mediaItemCount == 0) {
      return
    }
    val elapsedMs = System.currentTimeMillis() - pausedRouteAtMs
    val sameTrack = pausedRouteMediaId == null || pausedRouteMediaId == currentPlayer.currentMediaItem?.mediaId
    if (elapsedMs <= config.bluetoothAutoResumeWindowMs && sameTrack && requestAudioFocus()) {
      pausedByRouteLoss = false
      currentPlayer.play()
      emitDiagnostic("audioRouteAutoResume") {
        put("audioRouteEvent", "autoResume")
        put("routeType", routeTypeName())
      }
    }
  }

  private fun hasBluetoothOrWiredRoute(): Boolean {
    val manager = audioManager ?: return false
    return manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any { device ->
      device.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
        device.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
        device.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
        device.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
        device.type == AudioDeviceInfo.TYPE_USB_HEADSET
    }
  }

  private fun routeTypeName(): String {
    val manager = audioManager ?: return "unknown"
    val devices = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return when {
      devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO } -> "bluetooth"
      devices.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET || it.type == AudioDeviceInfo.TYPE_USB_HEADSET } -> "wired"
      devices.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER } -> "speaker"
      else -> "unknown"
    }
  }
}
