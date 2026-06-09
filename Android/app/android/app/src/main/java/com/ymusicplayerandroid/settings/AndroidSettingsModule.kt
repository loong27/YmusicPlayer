package com.ymusicplayerandroid.settings

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidSettingsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AndroidSettings"

  @ReactMethod
  fun getBatteryOptimizationStatus(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(statusMap("unavailable", true))
        return
      }
      val powerManager = reactContext.getSystemService(PowerManager::class.java)
      val ignoring = powerManager?.isIgnoringBatteryOptimizations(reactContext.packageName) == true
      promise.resolve(statusMap(if (ignoring) "ignored" else "not_ignored", ignoring))
    } catch (error: Exception) {
      promise.reject("E_BATTERY_STATUS", "无法读取电池优化状态", error)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(statusMap("unavailable", true))
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      try {
        reactContext.startActivity(intent)
      } catch (_: Exception) {
        reactContext.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        })
      }
      getBatteryOptimizationStatus(promise)
    } catch (error: Exception) {
      promise.reject("E_BATTERY_REQUEST", "无法打开电池优化设置", error)
    }
  }

  @ReactMethod
  fun getCrashLogs(promise: Promise) {
    try {
      val logs = CrashLogHelper.getCrashLogs()
      promise.resolve(logs)
    } catch (error: Exception) {
      promise.reject("E_CRASH_LOGS", "读取崩溃日志失败", error)
    }
  }

  @ReactMethod
  fun clearCrashLogs(promise: Promise) {
    try {
      CrashLogHelper.clearCrashLogs()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("E_CLEAR_CRASH_LOGS", "清除崩溃日志失败", error)
    }
  }

  private fun statusMap(status: String, ignoring: Boolean) = Arguments.createMap().apply {
    putString("status", status)
    putBoolean("isIgnoringBatteryOptimizations", ignoring)
  }
}
