package com.learning.platform;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(LlamaPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
    }
}
