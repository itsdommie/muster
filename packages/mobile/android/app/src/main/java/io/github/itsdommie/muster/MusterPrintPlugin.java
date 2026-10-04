package io.github.itsdommie.muster;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hands the page to Android's print system. The web view prints the page's print stylesheet (the list sheet), and the system dialog
 * offers any printer on the network as well as "Save as PDF".
 */
@CapacitorPlugin(name = "MusterPrint")
public class MusterPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        final String name = sanitize(call.getString("name", "Muster list"));
        getActivity().runOnUiThread(() -> {
            try {
                WebView webView = getBridge().getWebView();
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(name);
                printManager.print(name, adapter, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (RuntimeException e) {
                call.reject("Printing is not available on this device.");
            }
        });
    }

    /** The name becomes a file name and a job title: keep it short and plain. */
    private static String sanitize(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[^\\p{L}\\p{N} ._-]", "_").trim();
        if (cleaned.isEmpty()) cleaned = "Muster list";
        return cleaned.length() > 80 ? cleaned.substring(0, 80) : cleaned;
    }
}
