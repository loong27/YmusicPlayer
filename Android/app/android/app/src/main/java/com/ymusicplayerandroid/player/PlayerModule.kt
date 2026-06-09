package com.ymusicplayerandroid.player

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class PlayerModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var lastError: PlaybackException? = null
  private var boundPlayer: Player? = null
  private val player: Player
    get() {
      val current = PlaybackHolder.getOrCreatePlayer(reactContext)
      if (boundPlayer !== current) {
        boundPlayer?.removeListener(listener)
        current.addListener(listener)
        boundPlayer = current
      }
      return current
    }
  private val positionTicker = object : Runnable {
    override fun run() {
      emitPosition()
      mainHandler.postDelayed(this, 1000)
    }
  }

  private val listener = object : Player.Listener {
    override fun onPlaybackStateChanged(playbackState: Int) {
      if (playbackState == Player.STATE_BUFFERING || playbackState == Player.STATE_READY) {
        lastError = null
      }
      emitState()
      emitDiagnostic("playbackStateChanged") { map ->
        map.putString("nativePlaybackState", playbackState.toPlaybackStateName())
      }
      updatePositionTicker()
    }

    override fun onIsPlayingChanged(isPlaying: Boolean) {
      if (isPlaying) {
        lastError = null
      }
      emitState()
      emitDiagnostic("isPlayingChanged") { map ->
        map.putBoolean("isPlaying", isPlaying)
      }
      updatePositionTicker()
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      emitTrackChanged()
      emitQueueChanged()
      emitDiagnostic("mediaItemTransition") { map ->
        map.putString("reason", reason.toTransitionReasonName())
      }
    }

    override fun onRepeatModeChanged(repeatMode: Int) {
      emitState()
    }

    override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) {
      emitState()
    }

    override fun onPlayerError(error: PlaybackException) {
      lastError = error
      val map = errorMap(error)
      sendEvent("PlayerError", map)
      emitDiagnostic("playerError") { diagnosticMap ->
        putErrorFields(diagnosticMap, error)
      }
      emitState()
    }
  }

  init {
    PlaybackHolder.setDiagnosticSink { type, extras ->
      emitDiagnostic(type) { map ->
        extras.forEach { (key, value) -> putDiagnosticValue(map, key, value) }
      }
    }
    mainHandler.post {
      player
    }
  }

  override fun getName(): String = "Player"

  override fun invalidate() {
    mainHandler.removeCallbacks(positionTicker)
    PlaybackHolder.setDiagnosticSink(null)
    boundPlayer?.removeListener(listener)
    boundPlayer = null
    super.invalidate()
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun setQueue(tracks: ReadableArray, startIndex: Int, promise: Promise) {
    mainHandler.post {
      try {
        val mediaItems = tracks.toMediaItems()
        require(mediaItems.isNotEmpty()) { "Queue is empty" }
        lastError = null
        player.setMediaItems(mediaItems, startIndex.coerceIn(0, mediaItems.size - 1), 0L)
        player.prepare()
        startPlaybackService(foreground = true)
        if (!PlaybackHolder.prepareForPlay()) {
          throw IllegalStateException("音频通道暂时被其他应用占用")
        }
        player.play()
        emitQueueChanged()
        emitTrackChanged()
        emitState()
        promise.resolve(stateMap())
      } catch (error: Exception) {
        promise.reject("E_SET_QUEUE_FAILED", "Failed to set playback queue.", error)
      }
    }
  }

  @ReactMethod
  fun restoreQueue(tracks: ReadableArray, currentIndex: Int, positionMs: Double, repeatMode: String, shuffleEnabled: Boolean, playWhenReady: Boolean, promise: Promise) {
    mainHandler.post {
      try {
        val mediaItems = tracks.toMediaItems()
        lastError = null
        if (mediaItems.isEmpty()) {
          player.clearMediaItems()
          promise.resolve(stateMap())
          return@post
        }
        player.setMediaItems(mediaItems, currentIndex.coerceIn(0, mediaItems.size - 1), positionMs.toLong().coerceAtLeast(0L))
        player.repeatMode = repeatMode.toNativeRepeatMode()
        player.shuffleModeEnabled = shuffleEnabled
        player.prepare()
        if (playWhenReady) {
          startPlaybackService(foreground = true)
          if (!PlaybackHolder.prepareForPlay()) {
            throw IllegalStateException("音频通道暂时被其他应用占用")
          }
          player.play()
        } else {
          player.pause()
          startPlaybackService(foreground = false)
        }
        emitQueueChanged()
        emitTrackChanged()
        emitState()
        emitPosition()
        promise.resolve(stateMap())
      } catch (error: Exception) {
        promise.reject("E_RESTORE_QUEUE_FAILED", "Failed to restore playback queue.", error)
      }
    }
  }

  @ReactMethod
  fun playTrack(track: ReadableMap, promise: Promise) {
    mainHandler.post {
      try {
        lastError = null
        player.setMediaItem(trackToMediaItem(track))
        player.prepare()
        startPlaybackService(foreground = true)
        if (!PlaybackHolder.prepareForPlay()) {
          throw IllegalStateException("音频通道暂时被其他应用占用")
        }
        player.play()
        emitQueueChanged()
        emitTrackChanged()
        emitState()
        promise.resolve(stateMap())
      } catch (error: Exception) {
        promise.reject("E_PLAY_TRACK_FAILED", "Failed to play track.", error)
      }
    }
  }

  @ReactMethod
  fun play(promise: Promise) = runPlayerCommand(promise) {
    if (mediaItemCount == 0) {
      throw IllegalStateException("Queue is empty")
    }
    startPlaybackService(foreground = true)
    if (!PlaybackHolder.prepareForPlay()) {
      throw IllegalStateException("音频通道暂时被其他应用占用")
    }
    play()
  }

  @ReactMethod
  fun pause(promise: Promise) = runPlayerCommand(promise) {
    PlaybackHolder.markManualPause()
    pause()
  }

  @ReactMethod
  fun stop(promise: Promise) = runPlayerCommand(promise) {
    PlaybackHolder.markStopped()
    stop()
    clearMediaItems()
  }

  @ReactMethod
  fun configurePlaybackComfort(config: ReadableMap, promise: Promise) {
    mainHandler.post {
      PlaybackHolder.configure(PlaybackComfortConfig(
        audioFocusDuckOnTransient = if (config.hasKey("audioFocusDuckOnTransient")) config.getBoolean("audioFocusDuckOnTransient") else true,
        audioFocusPauseOnLoss = if (config.hasKey("audioFocusPauseOnLoss")) config.getBoolean("audioFocusPauseOnLoss") else true,
        audioFocusResumeAfterGain = if (config.hasKey("audioFocusResumeAfterGain")) config.getBoolean("audioFocusResumeAfterGain") else true,
        bluetoothAutoResumeOnReconnect = if (config.hasKey("bluetoothAutoResumeOnReconnect")) config.getBoolean("bluetoothAutoResumeOnReconnect") else true,
        bluetoothAutoResumeWindowMs = if (config.hasKey("bluetoothAutoResumeWindowMs")) config.getDouble("bluetoothAutoResumeWindowMs").toLong().coerceIn(60_000L, 10 * 60_000L) else 300_000L,
      ))
      promise.resolve(stateMap())
    }
  }

  @ReactMethod
  fun seekTo(positionMs: Double, promise: Promise) = runPlayerCommand(promise) {
    if (mediaItemCount == 0) {
      throw IllegalStateException("Queue is empty")
    }
    seekTo(positionMs.toLong().coerceAtLeast(0L))
  }

  @ReactMethod
  fun skipToNext(promise: Promise) = runPlayerCommand(promise) {
    if (mediaItemCount == 0) {
      throw IllegalStateException("Queue is empty")
    }
    if (hasNextMediaItem()) {
      seekToNextMediaItem()
    } else if (repeatMode == Player.REPEAT_MODE_ALL && mediaItemCount > 1) {
      seekTo(0, 0L)
    } else {
      seekTo(duration.takeIf { it > 0 } ?: currentPosition)
      pause()
    }
  }

  @ReactMethod
  fun skipToPrevious(promise: Promise) = runPlayerCommand(promise) {
    if (mediaItemCount == 0) {
      throw IllegalStateException("Queue is empty")
    }
    if (currentPosition > 3000 || currentMediaItemIndex <= 0) {
      seekTo(0L)
    } else {
      seekToPreviousMediaItem()
    }
  }

  @ReactMethod
  fun setRepeatMode(mode: String, promise: Promise) = runPlayerCommand(promise) {
    repeatMode = mode.toNativeRepeatMode()
  }

  @ReactMethod
  fun setShuffleEnabled(enabled: Boolean, promise: Promise) = runPlayerCommand(promise) {
    shuffleModeEnabled = enabled
  }

  @ReactMethod
  fun getState(promise: Promise) {
    mainHandler.post { promise.resolve(stateMap()) }
  }

  private fun runPlayerCommand(promise: Promise, command: Player.() -> Unit) {
    mainHandler.post {
      try {
        player.command()
        lastError = null
        emitState()
        emitPosition()
        promise.resolve(stateMap())
      } catch (error: Exception) {
        promise.reject("E_PLAYER_COMMAND_FAILED", "Player command failed.", error)
      }
    }
  }

  private fun ReadableArray.toMediaItems(): List<MediaItem> {
    val mediaItems = mutableListOf<MediaItem>()
    for (index in 0 until size()) {
      getMap(index)?.let { mediaItems.add(trackToMediaItem(it)) }
    }
    return mediaItems
  }

  private fun trackToMediaItem(track: ReadableMap): MediaItem {
    val uri = track.getString("localUri") ?: track.getString("uri") ?: track.getString("streamUri") ?: throw IllegalArgumentException("Track has no playable uri")
    val metadata = MediaMetadata.Builder()
      .setTitle(track.getString("title") ?: "未知歌曲")
      .setArtist(track.getString("artist") ?: "未知艺术家")
      .setAlbumTitle(track.getString("album"))
      .setArtworkUri(track.getString("artworkUri")?.let(Uri::parse))
      .build()
    return MediaItem.Builder()
      .setUri(uri)
      .setMediaId(track.getString("id") ?: uri)
      .setMediaMetadata(metadata)
      .build()
  }

  private fun stateMap(): WritableMap {
    val map = Arguments.createMap()
    val error = lastError
    val playbackState = when {
      error != null -> "error"
      player.playbackState == Player.STATE_BUFFERING -> "buffering"
      player.playbackState == Player.STATE_READY -> if (player.isPlaying) "playing" else "paused"
      player.playbackState == Player.STATE_ENDED -> "ended"
      else -> if (player.mediaItemCount > 0) "paused" else "idle"
    }
    map.putString("playbackState", playbackState)
    error?.let { map.putString("error", it.message ?: "Playback failed") }
    map.putDouble("positionMs", player.currentPosition.coerceAtLeast(0L).toDouble())
    map.putDouble("durationMs", player.duration.takeIf { it > 0 }?.toDouble() ?: 0.0)
    map.putInt("currentIndex", if (player.mediaItemCount > 0) player.currentMediaItemIndex else -1)
    map.putString("currentTrackId", player.currentMediaItem?.mediaId)
    map.putBoolean("shuffleEnabled", player.shuffleModeEnabled)
    map.putString("repeatMode", when (player.repeatMode) {
      Player.REPEAT_MODE_ONE -> "one"
      Player.REPEAT_MODE_ALL -> "all"
      else -> "off"
    })
    return map
  }

  private fun errorMap(error: PlaybackException): WritableMap {
    val map = Arguments.createMap()
    putErrorFields(map, error)
    return map
  }

  private fun putErrorFields(map: WritableMap, error: PlaybackException) {
    map.putString("message", error.message ?: "Playback failed")
    map.putInt("errorCode", error.errorCode)
    map.putString("errorCodeName", error.errorCodeName)
    map.putString("cause", error.cause?.javaClass?.simpleName ?: error.cause?.message)
    map.putString("playbackState", player.playbackState.toPlaybackStateName())
    map.putInt("currentIndex", if (player.mediaItemCount > 0) player.currentMediaItemIndex else -1)
    map.putDouble("positionMs", player.currentPosition.coerceAtLeast(0L).toDouble())
  }

  private fun emitState() = sendEvent("PlayerStateChanged", stateMap())

  private fun emitTrackChanged() {
    val map = Arguments.createMap()
    map.putInt("currentIndex", if (player.mediaItemCount > 0) player.currentMediaItemIndex else -1)
    map.putString("currentTrackId", player.currentMediaItem?.mediaId)
    sendEvent("PlayerTrackChanged", map)
  }

  private fun emitPosition() {
    val map = Arguments.createMap()
    map.putDouble("positionMs", player.currentPosition.coerceAtLeast(0L).toDouble())
    map.putDouble("durationMs", player.duration.takeIf { it > 0 }?.toDouble() ?: 0.0)
    sendEvent("PlayerPositionChanged", map)
  }

  private fun emitQueueChanged() {
    val map = Arguments.createMap()
    map.putInt("currentIndex", if (player.mediaItemCount > 0) player.currentMediaItemIndex else -1)
    map.putInt("queueSize", player.mediaItemCount)
    sendEvent("PlayerQueueChanged", map)
  }

  private fun emitDiagnostic(type: String, extras: ((WritableMap) -> Unit)? = null) {
    val map = Arguments.createMap()
    map.putString("type", type)
    map.putString("playbackState", player.playbackState.toPlaybackStateName())
    map.putBoolean("isPlaying", player.isPlaying)
    map.putInt("currentIndex", if (player.mediaItemCount > 0) player.currentMediaItemIndex else -1)
    map.putDouble("positionMs", player.currentPosition.coerceAtLeast(0L).toDouble())
    map.putDouble("durationMs", player.duration.takeIf { it > 0 }?.toDouble() ?: 0.0)
    addOutputRouteSnapshot(map)
    extras?.invoke(map)
    sendEvent("PlayerDiagnostic", map)
  }

  private fun putDiagnosticValue(map: WritableMap, key: String, value: Any?) {
    when (value) {
      is String -> map.putString(key, value)
      is Boolean -> map.putBoolean(key, value)
      is Int -> map.putInt(key, value)
      is Long -> map.putDouble(key, value.toDouble())
      is Double -> map.putDouble(key, value)
      is Float -> map.putDouble(key, value.toDouble())
      null -> map.putNull(key)
      else -> map.putString(key, value.toString())
    }
  }

  private fun addOutputRouteSnapshot(map: WritableMap) {
    val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    val devices = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    map.putBoolean("hasBluetoothA2dp", devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP })
    map.putBoolean("hasBluetoothSco", devices.any { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO })
    map.putBoolean("hasWiredHeadset", devices.any { it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET })
    map.putBoolean("hasBuiltInSpeaker", devices.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER })
  }

  private fun Int.toPlaybackStateName(): String = when (this) {
    Player.STATE_BUFFERING -> "buffering"
    Player.STATE_READY -> "ready"
    Player.STATE_ENDED -> "ended"
    Player.STATE_IDLE -> "idle"
    else -> "unknown"
  }

  private fun Int.toTransitionReasonName(): String = when (this) {
    Player.MEDIA_ITEM_TRANSITION_REASON_AUTO -> "auto"
    Player.MEDIA_ITEM_TRANSITION_REASON_SEEK -> "seek"
    Player.MEDIA_ITEM_TRANSITION_REASON_REPEAT -> "repeat"
    Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED -> "playlistChanged"
    else -> "unknown"
  }

  private fun updatePositionTicker() {
    mainHandler.removeCallbacks(positionTicker)
    if (player.isPlaying) {
      mainHandler.post(positionTicker)
    }
  }

  private fun sendEvent(eventName: String, params: WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
  }

  private fun startPlaybackService(foreground: Boolean) {
    val intent = Intent(reactContext, MusicPlaybackService::class.java)
    try {
      if (foreground) {
        ContextCompat.startForegroundService(reactContext, intent)
      } else {
        reactContext.startService(intent)
      }
      emitDiagnostic("serviceStartSuccess") { map ->
        map.putBoolean("foreground", foreground)
      }
    } catch (error: Exception) {
      emitDiagnostic("serviceStartFailed") { map ->
        map.putBoolean("foreground", foreground)
        map.putString("exception", error.javaClass.simpleName)
        map.putString("message", error.message ?: "启动播放服务失败")
      }
      throw IllegalStateException("启动播放服务失败：${error.message ?: error.javaClass.simpleName}", error)
    }
  }

  private fun String.toNativeRepeatMode(): Int = when (this) {
    "one" -> Player.REPEAT_MODE_ONE
    "all" -> Player.REPEAT_MODE_ALL
    else -> Player.REPEAT_MODE_OFF
  }
}
