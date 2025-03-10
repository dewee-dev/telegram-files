import { useEffect, useMemo, useState } from "react";
import {
  type DownloadStatus,
  type FileFilter,
  type TelegramFile, type TransferStatus,
} from "@/lib/types";
import useSWRInfinite from "swr/infinite";
import { useWebsocket } from "@/hooks/use-websocket";
import { WebSocketMessageType } from "@/lib/websocket-types";
import useLocalStorage from "@/hooks/use-local-storage";
import { useDebounce } from "use-debounce";

const DEFAULT_FILTERS: FileFilter = {
  search: "",
  type: "media",
  status: "all",
};

type FileResponse = {
  files: TelegramFile[];
  count: number;
  nextFromMessageId: number;
};

export function useFiles(accountId: string, chatId: string) {
  const { lastJsonMessage } = useWebsocket();
  const [latestFilesStatus, setLatestFileStatus] = useState<
    Record<
      string,
      {
        fileId: number;
        downloadStatus: DownloadStatus;
        localPath: string;
        completionDate: number;
        downloadedSize: number;
        transferStatus?: TransferStatus;
      }
    >
  >({});
  const [filters, setFilters, clearFilters] = useLocalStorage<FileFilter>(
    "telegramFileListFilter",
    DEFAULT_FILTERS,
  );
  const getKey = (page: number, previousPageData: FileResponse) => {
    if (page === 0) {
      return `/telegram/${accountId}/chat/${chatId}/files?search=${filters.search}&type=${filters.type}&status=${filters.status}`;
    }

    if (!previousPageData) {
      return null;
    }

    return `/telegram/${accountId}/chat/${chatId}/files?search=${filters.search}&type=${filters.type}&status=${filters.status}&fromMessageId=${previousPageData.nextFromMessageId}`;
  };

  const {
    data: pages,
    isLoading,
    isValidating,
    size,
    setSize,
    error,
  } = useSWRInfinite<FileResponse, Error>(getKey, {
    revalidateFirstPage: false,
    keepPreviousData: true,
  });

  const [debounceLoading] = useDebounce(isLoading || isValidating, 500, {
    leading: true,
    maxWait: 1000,
  });

  useEffect(() => {
    if (lastJsonMessage?.type !== WebSocketMessageType.FILE_STATUS) {
      return;
    }
    const data = lastJsonMessage.data as {
      fileId: number;
      uniqueId: string;
      downloadStatus: DownloadStatus;
      localPath: string;
      completionDate: number;
      downloadedSize: number;
      transferStatus?: TransferStatus;
    };

    setLatestFileStatus((prev) => ({
      ...prev,
      [data.uniqueId]: {
        fileId: data.fileId,
        downloadStatus:
          data.downloadStatus ?? prev[data.uniqueId]?.downloadStatus,
        localPath: data.localPath ?? prev[data.uniqueId]?.localPath,
        completionDate:
          data.completionDate ?? prev[data.uniqueId]?.completionDate,
        downloadedSize:
          data.downloadedSize ?? prev[data.uniqueId]?.downloadedSize,
        transferStatus:
          data.transferStatus ?? prev[data.uniqueId]?.transferStatus,
      },
    }));
  }, [lastJsonMessage]);

  const files = useMemo(() => {
    if (!pages) return [];
    const files: TelegramFile[] = [];
    pages.forEach((page) => {
      page.files.forEach((file) => {
        files.push({
          ...file,
          id: latestFilesStatus[file.uniqueId]?.fileId ?? file.id,
          downloadStatus:
            latestFilesStatus[file.uniqueId]?.downloadStatus ?? file.downloadStatus,
          localPath: latestFilesStatus[file.uniqueId]?.localPath ?? file.localPath,
          completionDate:
            latestFilesStatus[file.uniqueId]?.completionDate ?? file.completionDate,
          downloadedSize:
            latestFilesStatus[file.uniqueId]?.downloadedSize ?? file.downloadedSize,
          transferStatus:
            latestFilesStatus[file.uniqueId]?.transferStatus ?? file.transferStatus,
        });
      });
    });
    return files;
  }, [pages, latestFilesStatus]);

  const hasMore = useMemo(() => {
    if (!pages || pages.length === 0) return true;

    const fetchedCount = pages.reduce((acc, d) => acc + d.files.length, 0);
    const lastPage = pages[pages.length - 1];
    let hasMore = false;
    if (lastPage) {
      const count = lastPage.count;
      hasMore = count > fetchedCount && lastPage.nextFromMessageId !== 0;
    }
    return hasMore;
  }, [pages]);

  const handleLoadMore = async () => {
    if (isLoading || isValidating || !hasMore || error) return;
    await setSize(size + 1);
  };

  const handleFilterChange = async (newFilters: FileFilter) => {
    if (
      newFilters.search === filters.search &&
      newFilters.type === filters.type &&
      newFilters.status === filters.status
    ) {
      return;
    }
    setFilters(newFilters);
    await setSize(1);
  };

  return {
    files,
    filters,
    isLoading: debounceLoading,
    handleFilterChange,
    handleLoadMore,
    hasMore,
  };
}
