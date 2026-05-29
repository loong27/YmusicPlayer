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
        promise.resolve(queryAudio(minDurationMs))
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

  private fun queryAudio(minDurationMs: Long): WritableNativeArray {
    val resolver = reactContext.contentResolver
    val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
    val projection = mutableListOf(
      MediaStore.Audio.Media._ID,
      MediaStore.Audio.Media.TITLE,
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
        val id = cursor.getLong(idColumn)
        val albumId = cursor.getLong(albumIdColumn)
        val contentUri = ContentUris.withAppendedId(collection, id).toString()
        val map = WritableNativeMap()

        map.putString("id", id.toString())
        map.putString("title", cursor.getString(titleColumn).orEmpty())
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
        if (relativePathColumn >= 0 && !cursor.isNull(relativePathColumn)) {
          map.putString("relativePath", cursor.getString(relativePathColumn))
        }

        tracks.pushMap(map)
      }
    }

    return tracks
  }

  companion object {
    private const val DEFAULT_MIN_DURATION_MS = 30_000L
    private val ALBUM_ART_URI: Uri = Uri.parse("content://media/external/audio/albumart")
  }
}
