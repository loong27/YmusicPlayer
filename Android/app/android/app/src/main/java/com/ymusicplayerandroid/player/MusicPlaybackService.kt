package com.ymusicplayerandroid.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
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
    if (!player.isPlaying && player.mediaItemCount == 0) {
      stopSelf()
    }
  }

  private val listener = object : Player.Listener {
    override fun onIsPlayingChanged(isPlaying: Boolean) {
      scheduleIdleRelease()
    }

    override fun onMediaItemTransition(mediaItem: androidx.media3.common.MediaItem?, reason: Int) {
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
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = mediaSession?.player
    if (player == null || (!player.isPlaying && player.mediaItemCount == 0)) {
      stopSelf()
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(releaseWhenIdle)
    mediaSession?.run {
      player.removeListener(listener)
      player.release()
      release()
    }
    mediaSession = null
    PlaybackHolder.clear()
    super.onDestroy()
  }

  private fun scheduleIdleRelease() {
    mainHandler.removeCallbacks(releaseWhenIdle)
    val player = mediaSession?.player ?: return
    if (!player.isPlaying && player.mediaItemCount == 0) {
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
    private const val IDLE_RELEASE_DELAY_MS = 30_000L
  }
}

object PlaybackHolder {
  private var player: ExoPlayer? = null

  fun getOrCreatePlayer(context: android.content.Context): ExoPlayer {
    return player ?: ExoPlayer.Builder(context.applicationContext).build().also {
      val audioAttributes = AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build()
      it.setAudioAttributes(audioAttributes, true)
      it.setHandleAudioBecomingNoisy(true)
      it.setWakeMode(C.WAKE_MODE_LOCAL)
      it.repeatMode = Player.REPEAT_MODE_OFF
      player = it
    }
  }

  fun clear() {
    player = null
  }
}
