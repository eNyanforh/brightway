import { fireEvent, screen } from "@testing-library/react";

export async function enterEmail(user, email = "Tester@Example.com") {
  await screen.findByRole("heading", {
    name: "Create your BrightWay account",
  });

  await user.type(
    screen.getByLabelText("Email", { exact: true }),
    email,
  );

  await user.click(
    screen.getByRole("button", {
      name: "Continue to verification",
    }),
  );

  await screen.findByRole("heading", {
    name: "Verify your email",
  });
}

export async function verifyEmail(user) {
  await user.type(
    screen.getByLabelText("Verification code"),
    "123456",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Verify email and continue",
    }),
  );

  await screen.findByRole("heading", {
    name: "Tell us about yourself",
  });
}

export async function enterPersonalAndPassword(user) {
  for (const [label, value] of [
    ["First name", "Test"],
    ["Last name", "User"],
    ["Username", "TESTER"],
  ]) {
    await user.type(
      screen.getByLabelText(label, { exact: true }),
      value,
    );
  }

  await user.selectOptions(
    screen.getByLabelText("Gender"),
    "MALE",
  );

  await user.type(
    screen.getByLabelText("Date of birth"),
    "2000-06-15",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Continue",
      exact: true,
    }),
  );

  await screen.findByRole("heading", {
    name: "Choose your country",
  });

  await user.selectOptions(
    screen.getByLabelText("Country of residence"),
    "LR",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Continue",
      exact: true,
    }),
  );

  await screen.findByRole("heading", {
    name: "Create your password",
  });

  for (const label of ["Password", "Confirm password"]) {
    await user.type(
      screen.getByLabelText(label, { exact: true }),
      "A long personal passphrase!",
    );
  }

  await user.click(
    screen.getByRole("button", {
      name: "Continue",
      exact: true,
    }),
  );

  await screen.findByRole("heading", {
    name: "Add your profile photo",
  });
}

export async function submitPhoto(user) {
  await user.upload(
    screen.getByLabelText("Professional profile photo"),
    new File(["photo"], "photo.png", {
      type: "image/png",
    }),
  );

  // jsdom does not update native file validity for user-event uploads.
  fireEvent.submit(
    screen.getByLabelText("Professional profile photo").closest("form"),
  );
}