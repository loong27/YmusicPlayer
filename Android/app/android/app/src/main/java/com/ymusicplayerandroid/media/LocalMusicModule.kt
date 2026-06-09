package com.ymusicplayerandroid.media

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import java.util.concurrent.Executors

class LocalMusicModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "LocalMusic"

  @ReactMethod
  fun scanAudio(options: com.facebook.react.bridge.ReadableMap?, promise: Promise) {
    if (!hasAudioPermission()) {
      promise.reject("E_PERMISSION_DENIED", "Local music permission has not been granted.")
      return
    }

    executor.execute {
      try {
        val minDurationMs = if (options != null && options.hasKey("minDurationMs")) {
          options.getDouble("minDurationMs").toLong()
        } else {
          DEFAULT_MIN_DURATION_MS
        }
        val excludeNonMusicByName = options == null || !options.hasKey("excludeNonMusicByName") || options.getBoolean("excludeNonMusicByName")
        val customExcludeKeywords = if (options != null && options.hasKey("customExcludeKeywords")) {
          options.getString("customExcludeKeywords").orEmpty()
        } else {
          ""
        }
        promise.resolve(queryAudio(minDurationMs, excludeNonMusicByName, customExcludeKeywords))
      } catch (error: Exception) {
        promise.reject("E_QUERY_FAILED", "Failed to query local audio MediaStore.", error)
      }
    }
  }

  private fun hasAudioPermission(): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      Manifest.permission.READ_MEDIA_AUDIO
    } else {
      Manifest.permission.READ_EXTERNAL_STORAGE
    }

    return reactContext.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun queryAudio(minDurationMs: Long, excludeNonMusicByName: Boolean, customExcludeKeywords: String): WritableNativeArray {
    val resolver = reactContext.contentResolver
    val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val projection = mutableListOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.TITLE,
      MediaStore.Audio.Media.DISPLAY_NAME,
      MediaStore.Audio.Media.ARTIST,
      MediaStore.Audio.Media.ALBUM,
      MediaStore.Audio.Media.ALBUM_ID,
      MediaStore.Audio.Media.DURATION,
      MediaStore.Audio.Media.SIZE,
      MediaStore.Audio.Media.MIME_TYPE,
      MediaStore.Audio.Media.DATE_MODIFIED,
      MediaStore.Audio.Media.TRACK,
      MediaStore.Audio.Media.YEAR,
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      projection.add(MediaStore.Audio.Media.RELATIVE_PATH)
    }

    val tracks = WritableNativeArray()
    val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} > ?"
    val selectionArgs = arrayOf(minDurationMs.toString())
    val sortOrder = "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"

    resolver.query(collection, projection.toTypedArray(), selection, selectionArgs, sortOrder)?.use { cursor ->
      val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
      val titleColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
      val displayNameColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
      val artistColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
      val albumColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
      val albumIdColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
      val durationColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
      val sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)
      val mimeTypeColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.MIME_TYPE)
      val dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_MODIFIED)
      val trackColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
      val yearColumn = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
      val relativePathColumn = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        cursor.getColumnIndex(MediaStore.Audio.Media.RELATIVE_PATH)
      } else {
        -1
      }

      while (cursor.moveToNext()) {
        val title = cursor.getString(titleColumn).orEmpty()
        val displayName = cursor.getString(displayNameColumn).orEmpty()
        val relativePath = if (relativePathColumn >= 0 && !cursor.isNull(relativePathColumn)) {
          cursor.getString(relativePathColumn).orEmpty()
        } else {
          ""
        }
        if (shouldExcludeByName(title, displayName, relativePath, excludeNonMusicByName, customExcludeKeywords)) {
          continue
        }

        val id = cursor.getLong(idColumn)
        val albumId = cursor.getLong(albumIdColumn)
        val contentUri = ContentUris.withAppendedId(collection, id).toString()
        val map = WritableNativeMap()

        map.putString("id", id.toString())
        map.putString("title", title)
        map.putString("artist", cursor.getString(artistColumn).orEmpty())
        map.putString("album", cursor.getString(albumColumn).orEmpty())
        map.putDouble("durationMs", cursor.getLong(durationColumn).toDouble())
        map.putString("contentUri", contentUri)

        if (albumId > 0) {
          map.putString("artworkUri", ContentUris.withAppendedId(ALBUM_ART_URI, albumId).toString())
        }
        if (!cursor.isNull(sizeColumn)) {
          map.putDouble("size", cursor.getLong(sizeColumn).toDouble())
        }
        if (!cursor.isNull(mimeTypeColumn)) {
          map.putString("mimeType", cursor.getString(mimeTypeColumn))
        }
        if (!cursor.isNull(dateModifiedColumn)) {
          map.putDouble("dateModified", cursor.getLong(dateModifiedColumn).toDouble())
        }
        if (!cursor.isNull(trackColumn)) {
          map.putInt("trackNumber", cursor.getInt(trackColumn))
        }
        if (!cursor.isNull(yearColumn)) {
          map.putInt("year", cursor.getInt(yearColumn))
        }
        if (relativePath.isNotBlank()) {
          map.putString("relativePath", relativePath)
        }

        tracks.pushMap(map)
      }
    }

    return tracks
  }

  private fun shouldExcludeByName(title: String, displayName: String, relativePath: String, excludeNonMusicByName: Boolean, customExcludeKeywords: String): Boolean {
    val name = listOf(title, displayName)
      .joinToString(" ")
      .lowercase()
      .replace(Regex("\\.[a-z0-9]{2,5}$"), "")
    val path = relativePath.lowercase()
    val customKeywords = customExcludeKeywords
      .split(',', '\n', '，')
      .map { it.trim().lowercase() }
      .filter { it.isNotBlank() }
    if (customKeywords.any { name.contains(it) || path.contains(it) }) {
      return true
    }
    if (!excludeNonMusicByName) {
      return false
    }

    val folderHints = listOf(
      "recordings",
      "voice recorder",
      "sound_recorder",
      "call recordings",
      "ringtones",
      "notifications",
      "alarms",
      "录音",
      "语音",
      "通话录音",
      "铃声",
      "通知",
      "闹钟",
      "提示音",
    )
    if (folderHints.any { path.contains(it) }) {
      return true
    }

    val obviousNameHints = listOf(
      "通话录音",
      "电话录音",
      "会议录音",
      "录音文件",
      "微信语音",
      "语音消息",
      "屏幕录制",
      "通知音",
      "提示音",
      "系统音效",
      "闹钟铃声",
      "call recording",
      "voice note",
      "voice memo",
      "voice message",
      "screen recording",
      "notification sound",
      "ringtone",
      "alarm tone",
    )
    if (obviousNameHints.any { name.contains(it) }) {
      return true
    }

    val obviousGeneratedNames = listOf(
      Regex("^(record|recording|rec|voice|voicenote|voice_note|call|mic|audio_record|sound_record|screenrecord)[-_\\s]?\\d"),
      Regex("^aud[-_]\\d{8}"),
      Regex("^ptt[-_]\\d"),
      Regex("^\\d{8}[-_]\\d{6}.*(record|voice|call|录音|语音)"),
    )
    return obviousGeneratedNames.any { it.containsMatchIn(name) }
  }

  companion object {
    private const val DEFAULT_MIN_DURATION_MS = 30_000L
    private val ALBUM_ART_URI: Uri = Uri.parse("content://media/external/audio/albumart")
  }
}
