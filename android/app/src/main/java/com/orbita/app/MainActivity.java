package com.orbita.app;

import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Grant WebView permission requests (microphone, camera) so the web app
        // can use getUserMedia() for voice recording and camera capture.
        this.bridge.getWebView().setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }
}
