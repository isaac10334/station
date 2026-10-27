/** Electrobun v2.0.3-beta.26 Windows policy patch. Intentionally fails on any
 * upstream drift: re-audit the native creation path before updating the pin.
 * Unlike bun patch, this changes the compiled DLL, not the TypeScript SDK.
 */
export function patchBrowserNative(original: string) {
  let source = original.replaceAll("\r\n", "\n");
  const replace = (before: string, after: string) => {
    if (source.split(before).length !== 2)
      throw new Error(`Native patch anchor changed: ${before.slice(0, 90)}`);
    source = source.replace(before, after);
  };
  replace(
    "class WebView2View : public AbstractView {",
    "static void stationForgetBrowser(AbstractView*);\nclass WebView2View : public AbstractView {",
  );
  replace(
    "    std::string pendingUrl;",
    "    bool stationBrowser = false;\n    AbstractView* stationAddressTarget = nullptr;\n    std::string pendingUrl;",
  );
  replace(
    "        removed = true;\n        isCreationComplete = false;",
    "        removed = true;\n        stationForgetBrowser(this);\n        isCreationComplete = false;",
  );
  replace(
    "static std::shared_ptr<WebView2View> createWebView2View(",
    '#include "station-browser.h"\n\nstatic std::shared_ptr<WebView2View> createWebView2View(',
  );
  replace(
    "    view->customScript = customScript;",
    `    view->customScript = customScript;
    view->stationBrowser = partitionStr.rfind("station-private-", 0) == 0;
    if (view->stationBrowser) {
        view->electrobunScript.clear(); view->customScript.clear();
        if (!sandbox || !startTransparent || !startPassthrough) {
            view->setCreationFailed(true); retainAbstractView(view); return view;
        }
    }`,
  );
  replace(
    "                            view->setupJavaScriptBridges();",
    `                            if (!view->stationBrowser) view->setupJavaScriptBridges();
                            if (view->stationBrowser && FAILED(stationAttachBrowser(view, env, ctrl.Get()))) {
                                view->setCreationFailed(true); ctrl->Close(); return E_FAIL;
                            }`,
  );
  replace(
    "                            // Capture webviewId and handler for event handlers",
    "                            if (!view->stationBrowser) {\n                            // Capture webviewId and handler for event handlers",
  );
  replace(
    "                            // Navigate to URL or load pending HTML",
    "                            } // Station foreign views have only native policy handlers.\n                            // Navigate to URL or load pending HTML",
  );
  replace(
    '            options->put_AdditionalBrowserArguments(L"--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --allow-insecure-localhost --disable-web-security");',
    "            // Station: retain WebView2's default origin, TLS and reputation security.",
  );
  replace(
    "            if (SUCCEEDED(options.As(&options4))) {",
    "            if (!view->stationBrowser && SUCCEEDED(options.As(&options4))) {",
  );
  replace(
    '            } else {\n                ::log("ERROR: Failed to get ICoreWebView2EnvironmentOptions4 interface for custom scheme registration");',
    '            } else if (!view->stationBrowser) {\n                ::log("ERROR: Failed to get ICoreWebView2EnvironmentOptions4 interface for custom scheme registration");',
  );
  replace(
    "                return env->CreateCoreWebView2Controller(targetHwnd, controllerCompletedHandler.Get());",
    `                if (view->stationBrowser) {
                    ComPtr<ICoreWebView2Environment10> env10;
                    ComPtr<ICoreWebView2ControllerOptions> privateOptions;
                    if (FAILED(env->QueryInterface(IID_PPV_ARGS(&env10))) ||
                        FAILED(env10->CreateCoreWebView2ControllerOptions(&privateOptions)) ||
                        FAILED(privateOptions->put_IsInPrivateModeEnabled(TRUE))) {
                        view->setCreationFailed(true); return E_NOINTERFACE;
                    }
                    return env10->CreateCoreWebView2ControllerWithOptions(targetHwnd, privateOptions.Get(), controllerCompletedHandler.Get());
                }
                return env->CreateCoreWebView2Controller(targetHwnd, controllerCompletedHandler.Get());`,
  );
  replace(
    "                    if (!electrobun::canPersistWebView2UserDataPath(userDataFolder)) {",
    `                    if (view->stationBrowser) {
                        userDataFolder = electrobun::buildWebView2UserDataPath(localAppData, identifier, channel,
                            L"persist:" + partition, view->webviewId);
                    }
                    if (!electrobun::canPersistWebView2UserDataPath(userDataFolder)) {`,
  );
  return source;
}
