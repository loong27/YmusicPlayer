package com.ymusicplayerandroid.download

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class DownloadModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  init {
    DownloadEvents.attach(reactContext)
  }

  override fun getName(): String = "MusicDownload"

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun enqueue(task: ReadableMap, promise: Promise) {
    val taskId = task.getString("id") ?: run {
      promise.reject("E_DOWNLOAD_TASK", "Download task id is required.")
      return
    }
    val sourceUrl = task.getString("sourceUrl")
    val intent = Intent(reactContext, MusicDownloadService::class.java).apply {
      action = MusicDownloadService.ACTION_ENQUEUE
      putExtra(MusicDownloadService.EXTRA_TASK_ID, taskId)
      putExtra(MusicDownloadService.EXTRA_SOURCE_URL, sourceUrl)
      putExtra(MusicDownloadService.EXTRA_TITLE, task.getString("title"))
    }
    try {
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(statusMap(taskId, "queued"))
    } catch (error: Exception) {
      DownloadEvents.status(taskId, "failed", 0.0, error = "启动下载服务失败：${error.message ?: error.javaClass.simpleName}")
      promise.reject("E_DOWNLOAD_SERVICE_START", "启动下载服务失败", error)
    }
  }

  @ReactMethod
  fun pause(taskId: String, promise: Promise) {
    sendAction(MusicDownloadService.ACTION_PAUSE, taskId, promise, "paused")
  }

  @ReactMethod
  fun resume(taskId: String, promise: Promise) {
    sendAction(MusicDownloadService.ACTION_RESUME, taskId, promise, "queued")
  }

  @ReactMethod
  fun cancel(taskId: String, promise: Promise) {
    sendAction(MusicDownloadService.ACTION_CANCEL, taskId, promise, "canceled")
  }

  private fun sendAction(actionName: String, taskId: String, promise: Promise, resolvedStatus: String) {
    val intent = Intent(reactContext, MusicDownloadService::class.java).apply {
      action = actionName
      putExtra(MusicDownloadService.EXTRA_TASK_ID, taskId)
    }
    try {
      reactContext.startService(intent)
      promise.resolve(statusMap(taskId, resolvedStatus))
    } catch (error: Exception) {
      promise.reject("E_DOWNLOAD_SERVICE_START", "启动下载服务失败", error)
    }
  }

  private fun statusMap(taskId: String, status: String) = Arguments.createMap().apply {
    putString("id", taskId)
    putString("status", status)
  }
}
