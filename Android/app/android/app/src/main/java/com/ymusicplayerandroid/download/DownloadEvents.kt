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
    val context = reactContext ?: return
    if (context.hasActiveReactInstance()) {
      context
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
    }
  }

  fun status(taskId: String, status: String, progress: Double, downloadedBytes: Long = 0L, totalBytes: Long = 0L, targetUri: String? = null, error: String? = null) {
    val map = Arguments.createMap()
    map.putString("id", taskId)
    map.putString("status", status)
    map.putDouble("progress", progress)
    map.putDouble("downloadedBytes", downloadedBytes.toDouble())
    map.putDouble("totalBytes", totalBytes.toDouble())
    targetUri?.let { map.putString("targetUri", it) }
    error?.let { map.putString("error", it) }
    emit("DownloadTaskChanged", map)
  }
}
