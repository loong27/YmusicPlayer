package com.ymusicplayerandroid.download

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.IBinder
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import com.ymusicplayerandroid.MainActivity
import com.ymusicplayerandroid.R
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class MusicDownloadService : Service() {
  private val executor = Executors.newSingleThreadExecutor()
  private val activeTasks = ConcurrentHashMap<String, DownloadControl>()
  private lateinit var notificationManager: NotificationManager

  override fun onCreate() {
    super.onCreate()
    notificationManager = getSystemService(NotificationManager::class.java)
    createChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val taskId = intent?.getStringExtra(EXTRA_TASK_ID)
    when (intent?.action) {
      ACTION_ENQUEUE, ACTION_RESUME -> {
        if (taskId != null && !activeTasks.containsKey(taskId)) {
          val sourceUrl = intent.getStringExtra(EXTRA_SOURCE_URL)
          val title = intent.getStringExtra(EXTRA_TITLE) ?: taskId
          enqueue(taskId, sourceUrl, title)
        }
      }
      ACTION_PAUSE -> taskId?.let { pause(it) }
      ACTION_CANCEL -> taskId?.let { cancel(it) }
    }
    updateForeground()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    activeTasks.values.forEach { it.cancel.set(true) }
    executor.shutdownNow()
    super.onDestroy()
  }

  private fun enqueue(taskId: String, sourceUrl: String?, title: String) {
    if (sourceUrl.isNullOrBlank()) {
      DownloadEvents.status(taskId, "failed", 0.0, error = "缺少可下载 URL")
      return
    }
    val control = DownloadControl(title)
    activeTasks[taskId] = control
    DownloadEvents.status(taskId, "downloading", 0.0)
    executor.execute { download(taskId, sourceUrl, control) }
  }

  private fun pause(taskId: String) {
    activeTasks.remove(taskId)?.pause?.set(true)
    DownloadEvents.status(taskId, "paused", 0.0)
    updateForeground()
  }

  private fun cancel(taskId: String) {
    activeTasks.remove(taskId)?.cancel?.set(true)
    DownloadEvents.status(taskId, "canceled", 0.0)
    updateForeground()
  }

  private fun download(taskId: String, sourceUrl: String, control: DownloadControl) {
    var connection: HttpURLConnection? = null
    try {
      val url = URL(sourceUrl)
      connection = (url.openConnection() as HttpURLConnection).apply {
        connectTimeout = 15_000
        readTimeout = 30_000
        requestMethod = "GET"
      }
      val totalBytes = connection.contentLengthLong.coerceAtLeast(0L)
      val outputFile = File(getExternalFilesDir(Environment.DIRECTORY_MUSIC), "${sanitize(control.title)}-$taskId.tmp")
      var downloadedBytes = 0L
      connection.inputStream.use { input ->
        FileOutputStream(outputFile).use { output ->
          val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
          while (true) {
            if (control.cancel.get()) {
              outputFile.delete()
              return
            }
            if (control.pause.get()) {
              return
            }
            val read = input.read(buffer)
            if (read == -1) {
              break
            }
            output.write(buffer, 0, read)
            downloadedBytes += read
            val progress = if (totalBytes > 0) downloadedBytes.toDouble() / totalBytes else 0.0
            DownloadEvents.status(taskId, "downloading", progress, downloadedBytes, totalBytes)
            notificationManager.notify(NOTIFICATION_ID, buildNotification(activeTasks.size, progress))
          }
        }
      }
      val finalUri = publishDownloadedFile(outputFile, control.title)
      activeTasks.remove(taskId)
      DownloadEvents.status(taskId, "completed", 1.0, downloadedBytes, totalBytes, finalUri.toString())
    } catch (error: Exception) {
      activeTasks.remove(taskId)
      DownloadEvents.status(taskId, "failed", 0.0, error = error.message ?: "下载失败")
    } finally {
      connection?.disconnect()
      updateForeground()
    }
  }

  private fun updateForeground() {
    if (activeTasks.isEmpty()) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    } else {
      startForeground(NOTIFICATION_ID, buildNotification(activeTasks.size, 0.0))
    }
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    notificationManager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "音乐下载", NotificationManager.IMPORTANCE_LOW))
  }

  private fun buildNotification(taskCount: Int, progress: Double) = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(R.mipmap.ic_launcher)
    .setContentTitle("YMusic 下载")
    .setContentText("${taskCount} 个下载任务，进度 ${progress.times(100).toInt()}%")
    .setProgress(100, progress.times(100).toInt().coerceIn(0, 100), progress <= 0.0)
    .setOngoing(true)
    .setContentIntent(PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    ))
    .build()

  private fun publishDownloadedFile(tempFile: File, title: String): Uri {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Audio.Media.DISPLAY_NAME, "${sanitize(title)}.mp3")
        put(MediaStore.Audio.Media.TITLE, title)
        put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
        put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/YMusic")
        put(MediaStore.Audio.Media.IS_PENDING, 1)
      }
      val resolver = contentResolver
      val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IllegalStateException("无法创建 MediaStore 音乐文件")
      resolver.openOutputStream(uri)?.use { output ->
        FileInputStream(tempFile).use { input -> input.copyTo(output) }
      } ?: throw IllegalStateException("无法写入 MediaStore 音乐文件")
      values.clear()
      values.put(MediaStore.Audio.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      tempFile.delete()
      return uri
    }

    val musicDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC)
    val targetDir = File(musicDir, "YMusic").apply { mkdirs() }
    val finalFile = File(targetDir, "${sanitize(title)}-${System.currentTimeMillis()}.mp3")
    tempFile.renameTo(finalFile)
    return Uri.fromFile(finalFile)
  }

  private fun sanitize(value: String): String = value.replace(Regex("[^a-zA-Z0-9._-]"), "_").take(60).ifBlank { "download" }

  private data class DownloadControl(
    val title: String,
    val pause: AtomicBoolean = AtomicBoolean(false),
    val cancel: AtomicBoolean = AtomicBoolean(false),
  )

  companion object {
    const val ACTION_ENQUEUE = "com.ymusicplayerandroid.download.ENQUEUE"
    const val ACTION_PAUSE = "com.ymusicplayerandroid.download.PAUSE"
    const val ACTION_RESUME = "com.ymusicplayerandroid.download.RESUME"
    const val ACTION_CANCEL = "com.ymusicplayerandroid.download.CANCEL"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_SOURCE_URL = "sourceUrl"
    const val EXTRA_TITLE = "title"
    private const val CHANNEL_ID = "ymusic_downloads"
    private const val NOTIFICATION_ID = 3202
  }
}
