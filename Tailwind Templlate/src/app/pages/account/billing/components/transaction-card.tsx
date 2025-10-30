"use client";

// widgets
import { TransactionCard } from "@/widgets/cards";

// data
import { transactionCardData } from "@/data";
type Props = {};

export default function TransactionsCard({}: Props) {
  return (
    <div className="tw-col-span-2 tw-w-full">
      <TransactionCard
        title="Your Transaction's"
        date="23 - 30 March 2023"
        data={transactionCardData as any}
      />
    </div>
  );
}
