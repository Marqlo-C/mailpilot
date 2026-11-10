"use client";

import type { Subscription } from "@prisma/client";
import { TabsContent } from "@/components/ui/tabs";
import { PipelinePaginationFooter } from "@/components/ui/composites/pipeline-pagination";
import {
  ActiveDesktopTable,
  ActiveMobileCards,
  ArchiveDesktopTable,
  ArchiveMobileCards,
  EmptyState,
  type ArchiveEntry,
  type ResolvedBriefing,
} from "./parts";
import type { useCardListGestures } from "@/hooks/use-card-list-gestures";

export type SubscriptionActivePaneProps = {
  activeCount: number;
  filteredCount: number;
  paginatedActive: Subscription[];
  selectedIds: string[];
  lastClickedId: string | null;
  onToggleRow: (id: string) => void;
  bindItem: ReturnType<typeof useCardListGestures>["bindItem"];
  onUnsubscribe: (sub: Subscription) => void;
  onBriefing: (sub: Subscription) => void;
  resolveBriefing: (sub: Subscription) => ResolvedBriefing | null;
  onViewLastBriefing: (briefing: ResolvedBriefing) => void;
  onViewLastEmail: (sub: Subscription) => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function SubscriptionActivePane({
  activeCount,
  filteredCount,
  paginatedActive,
  selectedIds,
  lastClickedId,
  onToggleRow,
  bindItem,
  onUnsubscribe,
  onBriefing,
  resolveBriefing,
  onViewLastBriefing,
  onViewLastEmail,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
}: SubscriptionActivePaneProps) {
  return (
    <TabsContent value="active" className="relative z-0 mt-0 space-y-3 px-[7px]">
      {activeCount === 0 ? (
        <EmptyState
          title="No subscribed senders"
          body="MailPilot will capture senders that advertise List-Unsubscribe headers."
        />
      ) : filteredCount === 0 ? (
        <EmptyState
          title="No matching subscriptions"
          body="Try lowering the noise filter or clearing search filters."
        />
      ) : (
        <>
          <ActiveDesktopTable
            subscriptions={paginatedActive}
            selectedIds={selectedIds}
            lastClickedId={lastClickedId}
            onToggleRow={onToggleRow}
            bindItem={bindItem}
            insertBeforeId={null}
            insertAfterLast={false}
            onUnsubscribe={onUnsubscribe}
            onBriefing={onBriefing}
            resolveBriefing={resolveBriefing}
            onViewLastBriefing={onViewLastBriefing}
            onViewLastEmail={onViewLastEmail}
          />
          <ActiveMobileCards
            subscriptions={paginatedActive}
            selectedIds={selectedIds}
            lastClickedId={lastClickedId}
            onToggleRow={onToggleRow}
            bindItem={bindItem}
            insertBeforeId={null}
            insertAfterLast={false}
            onUnsubscribe={onUnsubscribe}
            onBriefing={onBriefing}
            resolveBriefing={resolveBriefing}
            onViewLastBriefing={onViewLastBriefing}
            onViewLastEmail={onViewLastEmail}
          />
          <PipelinePaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredCount}
            onPageChange={onPageChange}
          />
        </>
      )}
    </TabsContent>
  );
}

export type SubscriptionArchivePaneProps = {
  archiveCount: number;
  filteredCount: number;
  paginatedArchive: ArchiveEntry[];
  cleanupPendingKey: string | null;
  pending: boolean;
  onCleanup: (entry: ArchiveEntry) => void;
  onDeleteRecord: (entry: ArchiveEntry) => void;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
};

export function SubscriptionArchivePane({
  archiveCount,
  filteredCount,
  paginatedArchive,
  cleanupPendingKey,
  pending,
  onCleanup,
  onDeleteRecord,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
}: SubscriptionArchivePaneProps) {
  return (
    <TabsContent value="archive" className="relative z-0 mt-0 space-y-3 px-[7px]">
      {archiveCount === 0 ? (
        <EmptyState
          title="Archive is empty"
          body="Unsubscribed senders appear here so you can purge past mail later."
        />
      ) : filteredCount === 0 ? (
        <EmptyState
          title="No matching archived senders"
          body="Try lowering the noise filter or clearing search filters."
        />
      ) : (
        <>
          <ArchiveDesktopTable
            entries={paginatedArchive}
            cleanupPendingKey={cleanupPendingKey}
            pending={pending}
            onCleanup={onCleanup}
            onDeleteRecord={onDeleteRecord}
          />
          <ArchiveMobileCards
            entries={paginatedArchive}
            cleanupPendingKey={cleanupPendingKey}
            pending={pending}
            onCleanup={onCleanup}
            onDeleteRecord={onDeleteRecord}
          />
          <PipelinePaginationFooter
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={pageSize}
            totalItems={filteredCount}
            onPageChange={onPageChange}
          />
        </>
      )}
    </TabsContent>
  );
}
