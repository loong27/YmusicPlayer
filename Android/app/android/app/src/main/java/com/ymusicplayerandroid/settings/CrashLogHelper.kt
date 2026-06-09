package com.ymusicplayerandroid.settings

import android.content.Context
import android.os.Build
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object CrashLogHelper {
  private const val CRASH_DIR = "crash_logs"
  private const val MAX_LOG_FILES = 10
  private var originalHandler: Thread.UncaughtExceptionHandler? = null
  private var appContext: Context? = null

  fun install(context: Context) {
    appContext = context.applicationContext
    originalHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      writeCrashLog(throwable, thread)
      originalHandler?.uncaughtException(thread, throwable)
    }
  }

  private fun writeCrashLog(throwable: Throwable, thread: Thread) {
    val ctx = appContext ?: return
    try {
      val dir = File(ctx.filesDir, CRASH_DIR)
      if (!dir.exists()) dir.mkdirs()
      val timestamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
      val file = File(dir, "crash_${timestamp}.log")
      PrintWriter(FileWriter(file)).use { writer ->
        writer.println("=== YMusicPlayer Crash Log ===")
        writer.println("Time: ${SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())}")
        writer.println("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        writer.println("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        writer.println("Thread: ${thread.name}")
        writer.println()
        writer.println("--- Exception ---")
        throwable.printStackTrace(writer)
        writer.println()
        writer.println("--- Thread State ---")
        writer.println("State: ${thread.state}")
        writer.println()
        writer.println("--- Runtime Info ---")
        writer.println("Free Memory: ${Runtime.getRuntime().freeMemory() / 1024}KB")
        writer.println("Max Memory: ${Runtime.getRuntime().maxMemory() / 1024}KB")
        writer.println("Total Memory: ${Runtime.getRuntime().totalMemory() / 1024}KB")
        writer.flush()
      }
      trimOldLogs(dir)
    } catch (_: Exception) { }
  }

  private fun trimOldLogs(dir: File) {
    val files = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: return
    for (i in MAX_LOG_FILES until files.size) {
      files[i].delete()
    }
  }

  fun getCrashLogs(): String {
    val ctx = appContext ?: return "未初始化"
    val dir = File(ctx.filesDir, CRASH_DIR)
    if (!dir.exists()) return "暂无崩溃日志"
    val files = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: return "暂无崩溃日志"
    if (files.isEmpty()) return "暂无崩溃日志"
    val sb = StringBuilder()
    for (file in files.take(MAX_LOG_FILES)) {
      sb.append("===== ${file.name} =====\n")
      sb.append(file.readText())
      sb.append("\n\n")
    }
    return sb.toString()
  }

  fun clearCrashLogs(): Boolean {
    val ctx = appContext ?: return false
    val dir = File(ctx.filesDir, CRASH_DIR)
    if (!dir.exists()) return true
    dir.listFiles()?.forEach { it.delete() }
    return true
  }
}
