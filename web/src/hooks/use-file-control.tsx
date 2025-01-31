import { type TelegramFile } from "@/lib/types";
import useSWRMutation from "swr/mutation";
import { POST } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export function useFileControl(file: TelegramFile) {
  const { trigger: startDownload, isMutating: starting } = useSWRMutation(
    "/file/start-download",
    (
      key,
      { arg }: { arg: { chatId: number; messageId: number; fileId: number } },
    ) => POST(key, arg),
  );
  const { trigger: cancelDownload, isMutating: cancelling } = useSWRMutation(
    "/file/cancel-download",
    (key, { arg }: { arg: { fileId: number } }) => POST(key, arg),
  );
  const { trigger: togglePauseDownload, isMutating: togglingPause } =
    useSWRMutation(
      "/file/toggle-pause-download",
      (key, { arg }: { arg: { fileId: number; isPaused: boolean } }) =>
        POST(key, arg),
    );

  const downloadControl = {
    cancel: (fileId: number) => {
      void cancelDownload({ fileId });
    },
    start: (fileId: number) => {
      if (file) {
        if (file.downloadStatus !== "idle" && file.downloadStatus !== "error") {
          return;
        }
        if (!file.uniqueId || file.uniqueId.trim() === "") {
          toast({
            title: "Error",
            description: "☹️Sorry, this file cannot be downloaded",
          });
          return;
        }
        void startDownload({
          chatId: file.chatId,
          fileId,
          messageId: file.messageId,
        });
      }
    },
    togglePause: (fileId: number) => {
      if (file) {
        if (
          file.downloadStatus !== "downloading" &&
          file.downloadStatus !== "paused"
        ) {
          return;
        }
        void togglePauseDownload({
          fileId,
          isPaused: file.downloadStatus === "downloading",
        });
      }
    },
    cancelling,
    starting,
    togglingPause,
  };

  return {
    ...downloadControl,
  };
}
