AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage;
    return Section({}, [
      Text({ paragraph: "Use a dedicated LibreLinkUp follower account. Credentials are stored in Zepp Settings Storage on this phone; this is not encrypted secret storage." }),
      TextInput({
        label: "LibreLinkUp email",
        value: storage.getItem("libre_email") || "",
        onChange: (value) => storage.setItem("libre_email", value.trim()),
      }),
      TextInput({
        label: "LibreLinkUp password",
        type: "password",
        value: storage.getItem("libre_password") || "",
        onChange: (value) => storage.setItem("libre_password", value),
      }),
      Text({ paragraph: "Glucose display thresholds (mg/dL): red below Very Low or above Very High, yellow outside Low/High, green between Low and High inclusive. Invalid threshold order resets all four to defaults. Display colors are not medical alarms." }),
      TextInput({
        label: "Very low glucose threshold (default 70)",
        value: storage.getItem("glucose_very_low") || "70",
        onChange: (value) => storage.setItem("glucose_very_low", String(value).trim()),
      }),
      TextInput({
        label: "Low glucose threshold (default 80)",
        value: storage.getItem("glucose_low") || "80",
        onChange: (value) => storage.setItem("glucose_low", String(value).trim()),
      }),
      TextInput({
        label: "High glucose threshold (default 160)",
        value: storage.getItem("glucose_high") || "160",
        onChange: (value) => storage.setItem("glucose_high", String(value).trim()),
      }),
      TextInput({
        label: "Very high glucose threshold (default 240)",
        value: storage.getItem("glucose_very_high") || "240",
        onChange: (value) => storage.setItem("glucose_very_high", String(value).trim()),
      }),
      Text({ paragraph: "Diagnostics contain only timestamped event codes and HTTP statuses. No account credentials, tokens, glucose values or response bodies are logged." }),
      TextInput({
        label: "Diagnostics (select and copy text)",
        value: storage.getItem("diagnostic_log") || "No diagnostic events recorded yet",
        onChange: () => {},
      }),
      Button({
        label: "Clear diagnostic logs",
        onClick: () => storage.removeItem("diagnostic_log"),
      }),
      Button({
        label: "Disconnect and erase credentials",
        onClick: () => {
          storage.removeItem("libre_email");
          storage.removeItem("libre_password");
        },
      }),
    ]);
  },
});
