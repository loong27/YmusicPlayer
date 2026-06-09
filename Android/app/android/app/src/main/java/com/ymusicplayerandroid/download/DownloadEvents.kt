package com.ymusicplayerandroid.download

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

object DownloadEvents {
  private var reactContext: ReactApplicationContext? = null

  fun attach(context: ReactApplicationContext) {
    reactContext = context
  }

  fun emit(eventName: String, params: WritableMap) {
    try {
      val context = reactContext ?: return
      if (context.hasActiveReactInstance()) {
        context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(eventName, params)
      }
    } catch (ignored: Exception) = Unit
  }

  fun status(taskId: String, status: String, progress: Double, downloadedBytes: Long = 0L, totalBytes: Long = 0L, targetUri: String? = null, error: String? = null) {
    try {
      val map = Arguments.createMap()
      map.putString("id", taskId)
      map.putString("status", status)
      map.putDouble("progress", progress)
      map.putDouble("downloadedBytes", downloadedBytes.toDouble())
      map.putDouble("totalBytes", totalBytes.toDouble())
      targetUri?.let { map.putString("targetUri", it) }
      error?.let { map.putString("error", it.take(500)) }
      emit("DownloadTaskChanged", map)
    } catch (ignored: Exception) = Unit
  }
}
