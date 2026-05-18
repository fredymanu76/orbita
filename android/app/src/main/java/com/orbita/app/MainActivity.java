package com.orbita.app;

import android.os.Bundle;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Request runtime permissions for microphone and camera up front
        // so the WebView can use getUserMedia() for voice recording.
        String[] permissions = {
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA
        };

        boolean needRequest = false;
        for (String perm : permissions) {
            if (ContextCompat.checkSelfPermission(this, perm) != PackageManager.PERMISSION_GRANTED) {
                needRequest = true;
                break;
            }
        }

        if (needRequest) {
            ActivityCompat.requestPermissions(this, permissions, 1);
        }

        // Allow media playback / recording without requiring a user gesture
        WebView webView = this.bridge.getWebView();
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}
