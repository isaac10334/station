wit_bindgen::generate!({ world: "component", generate_all });

struct Component;

impl Guest for Component {
    async fn run(input: String) -> String {
        let clock = wasi::clocks::monotonic_clock::now();
        let (mut stream, expected) = unit::workspace::host::feed(&input);
        let mut count = 0u32;
        while let Some(_) = stream.next().await { count += 1; }
        let expected = expected.await;
        if count != expected || clock == u64::MAX { return "Invalid host feed".into(); }
        unit::workspace::host::log(&format!("greeting received {count} bytes"));
        let output = format!("Hello, {}!", input.trim());
        unit::workspace::surface::set_text(&output);
        output
    }
}

export!(Component);
