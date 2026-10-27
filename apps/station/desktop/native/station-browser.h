// Included after WebView2View by the pinned native patch. All COM access runs
// on Electrobun's UI dispatcher. No page messages are trusted or subscribed.
#include <urlmon.h>
#include <winrt/Windows.Foundation.Collections.h>

struct StationBrowserState {
    bool loading = false;
    unsigned addressFocus = 0;
    UINT64 navigation = 0;
    std::string error;
};
static std::map<AbstractView*, std::shared_ptr<StationBrowserState>> stationBrowsers;
static void stationForgetBrowser(AbstractView* view) { stationBrowsers.erase(view); }

static bool stationBrowserURL(const wchar_t* value) {
    if (!value || wcslen(value) > 8192) return false;
    std::wstring raw(value);
    for (auto c : raw) if (c <= 32 || c == 127 || c == L'\\') return false;
    ComPtr<IUri> uri;
    if (FAILED(CreateUri(value, Uri_CREATE_CANONICALIZE, 0, &uri))) return false;
    BSTR scheme = nullptr, host = nullptr, user = nullptr;
    uri->GetSchemeName(&scheme); uri->GetHost(&host); uri->GetUserInfo(&user);
    std::wstring s = scheme ? scheme : L"", h = host ? host : L"";
    bool credentials = user && SysStringLen(user);
    SysFreeString(scheme); SysFreeString(host); SysFreeString(user);
    std::transform(h.begin(), h.end(), h.begin(), towlower);
    while (!h.empty() && h.back() == L'.') h.pop_back();
    DWORD port = 0; uri->GetPort(&port);
    if ((s != L"http" && s != L"https") || credentials || h.empty() ||
        port == 43157 || h.find(L':') != std::wstring::npos ||
        h == L"localhost" || h == L"local" || h == L"localhost.localdomain" ||
        h.ends_with(L".localhost") || h.ends_with(L".local")) return false;
    // IUri canonicalizes numeric hosts. Reject ambiguous alternate numeric
    // spellings rather than relying on browser/WinHTTP parser equivalence.
    IN_ADDR address{};
    if (InetPtonW(AF_INET, h.c_str(), &address) == 1) {
        auto b = reinterpret_cast<unsigned char*>(&address);
        return !(b[0] == 0 || b[0] == 10 || b[0] == 127 || b[0] >= 224 ||
            (b[0] == 169 && b[1] == 254) || (b[0] == 172 && b[1] >= 16 && b[1] <= 31) ||
            (b[0] == 192 && b[1] == 168) || (b[0] == 100 && b[1] >= 64 && b[1] <= 127));
    }
    auto label = h.substr(h.find_last_of(L'.') == std::wstring::npos ? 0 : h.find_last_of(L'.') + 1);
    if (label.empty() || iswdigit(label[0]) || label.starts_with(L"0x")) return false;
    return h.find(L'.') != std::wstring::npos;
}

static HRESULT stationAttachBrowser(const std::shared_ptr<WebView2View>& view,
                                   ICoreWebView2Environment* env, ICoreWebView2Controller* controller) {
    auto web = view->getWebView();
    auto state = std::make_shared<StationBrowserState>();
    stationBrowsers[view.get()] = state;
    ComPtr<ICoreWebView2Settings> settings;
    ComPtr<ICoreWebView2Settings3> settings3;
    ComPtr<ICoreWebView2Settings4> settings4;
    ComPtr<ICoreWebView2_4> web4;
    ComPtr<ICoreWebView2_18> web18;
    ComPtr<ICoreWebView2_13> web13;
    ComPtr<ICoreWebView2_10> web10;
    ComPtr<ICoreWebView2_5> web5;
    ComPtr<ICoreWebView2Profile> profile;
    BOOL privateMode = FALSE;
    if (FAILED(web->get_Settings(&settings)) || FAILED(settings.As(&settings3)) ||
        FAILED(settings.As(&settings4)) || FAILED(web.As(&web4)) || FAILED(web.As(&web18)) ||
        FAILED(web.As(&web13)) || FAILED(web.As(&web10)) || FAILED(web.As(&web5)) || FAILED(web13->get_Profile(&profile)) ||
        FAILED(profile->get_IsInPrivateModeEnabled(&privateMode)) || !privateMode) return E_NOINTERFACE;
    settings->put_AreHostObjectsAllowed(FALSE);
    settings->put_IsWebMessageEnabled(FALSE);
    settings->put_AreDevToolsEnabled(FALSE);
    settings->put_AreDefaultContextMenusEnabled(FALSE);
    settings->put_AreDefaultScriptDialogsEnabled(FALSE);
    settings3->put_AreBrowserAcceleratorKeysEnabled(FALSE);
    settings4->put_IsPasswordAutosaveEnabled(FALSE);
    settings4->put_IsGeneralAutofillEnabled(FALSE);
    auto weakView = std::weak_ptr<WebView2View>(view);
    EventRegistrationToken acceleratorToken{};
    HRESULT accelerator = controller->add_AcceleratorKeyPressed(Callback<ICoreWebView2AcceleratorKeyPressedEventHandler>(
        [state, weakView](ICoreWebView2Controller*, ICoreWebView2AcceleratorKeyPressedEventArgs* args) -> HRESULT {
            UINT key = 0; args->get_VirtualKey(&key);
            COREWEBVIEW2_KEY_EVENT_KIND kind; args->get_KeyEventKind(&kind);
            if (key == 'L' && (GetKeyState(VK_CONTROL) & 0x8000) && kind == COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN) {
                args->put_Handled(TRUE); ++state->addressFocus;
                if (auto view = weakView.lock()) MainThreadDispatcher::dispatch_async(retainedWebviewCallback(view->stationAddressTarget, [](AbstractView* root) { root->focus(); }, []() {}));
            }
            return S_OK;
        }).Get(), &acceleratorToken);
    if (FAILED(accelerator)) return accelerator;
    HRESULT hr = web->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
            LPWSTR uri = nullptr; args->get_Uri(&uri);
            bool allowed = stationBrowserURL(uri); CoTaskMemFree(uri);
            args->get_NavigationId(&state->navigation);
            args->put_Cancel(!allowed);
            state->loading = allowed;
            state->error = allowed ? "" : "Navigation blocked by browser policy.";
            return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web10->add_BasicAuthenticationRequested(Callback<ICoreWebView2BasicAuthenticationRequestedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2BasicAuthenticationRequestedEventArgs* args) -> HRESULT {
            args->put_Cancel(TRUE); state->error = "HTTP authentication requires separate authority."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web5->add_ClientCertificateRequested(Callback<ICoreWebView2ClientCertificateRequestedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2ClientCertificateRequestedEventArgs* args) -> HRESULT {
            args->put_Cancel(TRUE); args->put_Handled(TRUE);
            state->error = "Client certificate access requires separate authority."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web->add_FrameNavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
        [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
            LPWSTR uri = nullptr; args->get_Uri(&uri);
            bool allowed = uri && (wcscmp(uri, L"about:blank") == 0 || stationBrowserURL(uri));
            CoTaskMemFree(uri); args->put_Cancel(!allowed); return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
            UINT64 navigation = 0; args->get_NavigationId(&navigation);
            if (navigation != state->navigation) return S_OK;
            state->loading = false; BOOL success = FALSE; args->get_IsSuccess(&success);
            COREWEBVIEW2_WEB_ERROR_STATUS status; args->get_WebErrorStatus(&status);
            if (!success && status != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED && state->error.empty())
                state->error = "Page failed to load.";
            return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web->add_ProcessFailed(Callback<ICoreWebView2ProcessFailedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2ProcessFailedEventArgs*) -> HRESULT {
            state->loading = false; state->error = "Browser renderer failed. Reload this tab.";
            fprintf(stderr, "[Station browser] renderer failure\n"); return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web->add_NewWindowRequested(Callback<ICoreWebView2NewWindowRequestedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
            args->put_Handled(TRUE); state->error = "Popup blocked. Open its address in a new tab."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web4->add_DownloadStarting(Callback<ICoreWebView2DownloadStartingEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2DownloadStartingEventArgs* args) -> HRESULT {
            args->put_Cancel(TRUE); args->put_Handled(TRUE);
            state->error = "Download blocked: no download destination grant."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web->add_PermissionRequested(Callback<ICoreWebView2PermissionRequestedEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
            args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
            state->error = "Browser permission denied: no device or clipboard grant."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    hr = web18->add_LaunchingExternalUriScheme(Callback<ICoreWebView2LaunchingExternalUriSchemeEventHandler>(
        [state](ICoreWebView2*, ICoreWebView2LaunchingExternalUriSchemeEventArgs* args) -> HRESULT {
            args->put_Cancel(TRUE); state->error = "External protocol blocked."; return S_OK;
        }).Get(), nullptr);
    if (FAILED(hr)) return hr;
    // Also filter page/subframe requests, not just the address bar. This is a
    // destination guard, not DNS pinning or a network firewall.
    hr = web->AddWebResourceRequestedFilter(L"*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
    if (FAILED(hr)) return hr;
    ComPtr<ICoreWebView2Environment> environment(env);
    return web->add_WebResourceRequested(Callback<ICoreWebView2WebResourceRequestedEventHandler>(
        [environment](ICoreWebView2*, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
            ComPtr<ICoreWebView2WebResourceRequest> request; args->get_Request(&request);
            LPWSTR uri = nullptr; request->get_Uri(&uri);
            bool allowed = uri && (stationBrowserURL(uri) || wcsncmp(uri, L"data:", 5) == 0 || wcsncmp(uri, L"blob:", 5) == 0);
            CoTaskMemFree(uri);
            if (!allowed) {
                ComPtr<ICoreWebView2WebResourceResponse> response;
                environment->CreateWebResourceResponse(nullptr, 403, L"Blocked", L"Content-Length: 0", &response);
                args->put_Response(response.Get());
            }
            return S_OK;
        }).Get(), nullptr);
}

extern "C" ELECTROBUN_EXPORT int stationBrowserABI() { return 1; }
// Private native acceptance diagnostics; not exposed through the browser contract.
extern "C" ELECTROBUN_EXPORT const char* stationBrowserBounds(AbstractView* ptr) {
    std::string result = "{}";
    dispatchWebviewOperation(ptr, [&](AbstractView* current) {
        auto view = dynamic_cast<WebView2View*>(current);
        if (!view || !view->getController()) return;
        RECT bounds{};
        if (FAILED(view->getController()->get_Bounds(&bounds))) return;
        winrt::Windows::Data::Json::JsonObject object;
        auto number = [&](const wchar_t* key, double value) {
            object.Insert(key, winrt::Windows::Data::Json::JsonValue::CreateNumberValue(value));
        };
        number(L"x", bounds.left); number(L"y", bounds.top);
        number(L"width", bounds.right - bounds.left); number(L"height", bounds.bottom - bounds.top);
        number(L"dpi", view->parentDpi());
        result = winrt::to_string(object.Stringify());
    });
    return _strdup(result.c_str());
}
extern "C" ELECTROBUN_EXPORT void stationBrowserAddressTarget(AbstractView* ptr, AbstractView* root) {
    dispatchWebviewOperation(ptr, [=](AbstractView* current) {
        if (auto view = dynamic_cast<WebView2View*>(current)) view->stationAddressTarget = root;
    });
}
extern "C" ELECTROBUN_EXPORT bool stationBrowserCheckURL(const char* input) {
    std::wstring value;
    return input && utf8ToWide(input, value) && stationBrowserURL(value.c_str());
}
extern "C" ELECTROBUN_EXPORT const char* stationBrowserSnapshot(AbstractView* ptr) {
    std::string result = "{}";
    dispatchWebviewOperation(ptr, [&](AbstractView* ptr) {
        auto it = stationBrowsers.find(ptr);
        winrt::Windows::Data::Json::JsonObject object;
        auto text = [&](const wchar_t* key, const std::string& value) {
            object.Insert(key, winrt::Windows::Data::Json::JsonValue::CreateStringValue(winrt::to_hstring(value)));
        };
        auto boolean = [&](const wchar_t* key, bool value) {
            object.Insert(key, winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(value));
        };
        auto view = dynamic_cast<WebView2View*>(ptr);
        if (!view || view->creationFailed || view->isRemoved()) {
            text(L"error", "Browser initialization failed."); boolean(L"loading", false);
        } else if (it == stationBrowsers.end() || !view->isReady()) {
            text(L"error", ""); boolean(L"loading", true);
        } else {
            auto web = view->getWebView(); LPWSTR value = nullptr;
            web->get_Source(&value); std::string url; if (value) wideToUtf8(value, url); CoTaskMemFree(value);
            text(L"url", url); value = nullptr;
            web->get_DocumentTitle(&value); std::string title; if (value) wideToUtf8(value, title); CoTaskMemFree(value);
            text(L"title", title);
            BOOL back = FALSE, forward = FALSE; web->get_CanGoBack(&back); web->get_CanGoForward(&forward);
            boolean(L"back", back); boolean(L"forward", forward);
            boolean(L"loading", it->second->loading); text(L"error", it->second->error);
            object.Insert(L"addressFocus", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(it->second->addressFocus));
        }
        result = winrt::to_string(object.Stringify());
    });
    return _strdup(result.c_str());
}
extern "C" ELECTROBUN_EXPORT void stationBrowserFree(const char* value) { free((void*)value); }
extern "C" ELECTROBUN_EXPORT void stationBrowserStop(AbstractView* ptr) {
    dispatchWebviewOperation(ptr, [](AbstractView* ptr) {
        auto view = dynamic_cast<WebView2View*>(ptr);
        auto it = stationBrowsers.find(ptr);
        if (view && view->isReady() && it != stationBrowsers.end()) {
            view->getWebView()->Stop(); it->second->loading = false;
        }
    });
}
