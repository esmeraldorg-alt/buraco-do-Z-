package br.com.buracodoze.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * Casca do Buraco do Zé: abre o jogo do servidor em tela cheia, em pé.
 * O jogo se atualiza sozinho pelo servidor — não precisa de APK novo a cada mudança.
 */
public class MainActivity extends Activity {
    private static final String URL = "https://buraco-do-ze.onrender.com/";
    private static final int VERDE = Color.parseColor("#0F4D2E");

    private WebView web;
    private TextView aviso;
    private boolean erro = false;

    /** Ponte com o jogo: o botão "Sim, sair" do menu fecha o app */
    public class Ponte {
        @JavascriptInterface
        public void sair() {
            runOnUiThread(() -> finishAndRemoveTask());
        }
    }

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(VERDE);
        getWindow().setNavigationBarColor(VERDE);

        FrameLayout raiz = new FrameLayout(this);
        raiz.setBackgroundColor(VERDE);

        web = new WebView(this);
        web.setBackgroundColor(VERDE);
        raiz.addView(web, new FrameLayout.LayoutParams(-1, -1));

        aviso = new TextView(this);
        aviso.setText("Buraco do Zé\n\nAcordando o servidor...\nA primeira abertura do dia pode levar até 1 minuto.");
        aviso.setTextColor(Color.WHITE);
        aviso.setTextSize(18);
        aviso.setGravity(Gravity.CENTER);
        aviso.setBackgroundColor(VERDE);
        aviso.setPadding(48, 48, 48, 48);
        raiz.addView(aviso, new FrameLayout.LayoutParams(-1, -1));
        setContentView(raiz);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                    // o login fica guardado no aparelho
        s.setMediaPlaybackRequiresUserGesture(false);    // som ambiente do cassino
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " BuracoDoZeApp");

        web.addJavascriptInterface(new Ponte(), "BuracoApp");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView v, String u, android.graphics.Bitmap b) {
                erro = false;
            }

            @Override
            public void onPageFinished(WebView v, String u) {
                if (!erro) aviso.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    erro = true;
                    aviso.setText("Sem conexão com o servidor.\nToque na tela para tentar de novo.");
                    aviso.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String host = u.getHost();
                if (host != null && host.endsWith("onrender.com")) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, u));   // links de fora abrem no navegador
                return true;
            }
        });
        aviso.setOnClickListener(v -> {
            aviso.setText("Conectando...");
            web.loadUrl(URL);
        });

        // Link de convite (buraco-do-ze.onrender.com/?sala=XXXXX) aberto pelo app
        Uri convite = getIntent() != null ? getIntent().getData() : null;
        if (estado != null) web.restoreState(estado);
        else web.loadUrl(convite != null ? convite.toString() : URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle saida) {
        super.onSaveInstanceState(saida);
        web.saveState(saida);
    }

    // O Voltar do celular passa para o jogo: na partida volta ao menu; no menu pergunta "Quer sair?".
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
