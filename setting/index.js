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
