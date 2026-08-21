import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FeedEmpty({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-[#38555a] bg-[#102328]/70 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#1a3439] text-[#a8c8c9]"><Inbox size={22} /></span><h3 className="mt-4 text-base font-bold text-white">No {label} matches right now</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#88a1a5]">Try another sport or match status. New events will appear here as the feed refreshes.</p></div>;
}

export function FeedError({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-2xl border border-[#784138]/70 bg-[#2b1e1d]/60 px-6 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#4b2925] text-[#ff9a82]"><AlertTriangle size={22} /></span><h3 className="mt-4 text-base font-bold text-white">The scores feed is taking a timeout</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[#d5aaa0]">Your saved matches are still here. Please refresh to reconnect with the data service.</p><Button onClick={onRetry} className="mt-5 bg-[#ff977e] text-[#35120d] hover:bg-[#ffaf9a]"><RefreshCw size={15} />Retry feed</Button></div>;
}
