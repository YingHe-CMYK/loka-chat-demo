import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
export default function MirrorCamera({
  onNod,
  onShake,
}: {
  onNod: () => void;
  onShake: () => void;
}) {
  const alive = useRef(true);
  const mount = useRef<HTMLDivElement>(null),
    controller = useRef<any>(null),
    callbacks = useRef({ onNod, onShake });
  callbacks.current = { onNod, onShake };
  const [state, setState] = useState("off"),
    [message, M] = useState("Turn on your mirror."),
    [signal, S] = useState("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.dispose();
    };
  }, []);
  async function start() {
    try {
      if (!controller.current) {
        const path = "/previous/real-input.js";
        const { MirrorInputs } = await import(/* @vite-ignore */ path);
        if (!alive.current) return;
        controller.current = new MirrorInputs({
          isActive: () => !document.hidden,
          onEvent: (event: string) => {
            if (event === "nod") {
              S("Nod detected");
              callbacks.current.onNod();
            } else if (event === "next" || event === "shake") {
              S("Head shake detected");
              callbacks.current.onShake();
            }
          },
          onStatus: (s: any) => {
            if (!alive.current) return;
            setState(s.camera);
            M(
              s.camera === "on"
                ? "Camera on. Look straight ahead for two seconds, then nod or shake your head."
                : s.camera === "loading"
                  ? "Requesting camera access and loading local recognition…"
                  : s.camera === "error"
                    ? "Camera unavailable. Check permissions and try again."
                    : "Camera off",
            );
            if (controller.current) controller.current.showPreview(true);
          },
        });
        mount.current?.append(controller.current.video);
      }
      await controller.current.startCamera();
    } catch {
      M("Camera unavailable. Continue with the buttons.");
      setState("error");
    }
  }
  return (
    <section className="camera-panel">
      <div ref={mount} className="camera-view">
        {state !== "on" && <span>Your mirror</span>}
      </div>
      <p role="status">{message}</p>
      {signal && <p>{signal}</p>}
      <p className="note">
        Processed on device. Nod to continue or shake your head to correct. No payment authorization.
      </p>
      {state === "on" ? (
        <Button secondary onClick={() => controller.current.stopAll()}>
          Turn off camera
        </Button>
      ) : (
        <Button disabled={state === "loading"} onClick={() => void start()}>
          Turn on camera
        </Button>
      )}
    </section>
  );
}
