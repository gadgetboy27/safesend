import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useGetAdminStats, useAdminListDeals, getGetAdminStatsQueryKey, getAdminListDealsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DealStateBadge } from "@/components/deal-state-badge";
import { format } from "date-fns";
import { AlertCircle, ShieldAlert } from "lucide-react";

export default function AdminDashboard() {
  const [page, setPage] = useState(1);
  const [, navigate] = useLocation();

  const { data: stats, isError: statsError, error: statsRawError } = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), retry: false }
  });

  const { data: dealsData } = useAdminListDeals(
    { page, limit: 10 },
    { query: { queryKey: getAdminListDealsQueryKey({ page, limit: 10 }), retry: false } }
  );

  const statusCode = (statsRawError as { status?: number } | null)?.status;

  if (statsError && statusCode === 401) {
    navigate(`/login?next=/admin`);
    return null;
  }

  if (statsError && statusCode === 403) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20 text-center">
          <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-6">Your account does not have admin privileges.</p>
          <Link href="/deals">
            <Button variant="outline">Go to My Deals</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900 mb-8">Admin Dashboard</h1>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Total Volume</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${stats.totalVolumeNzd.toFixed(2)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Fee Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${stats.totalFeeRevenueNzd.toFixed(2)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-500">Active Deals</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{stats.activeDeals}</p></CardContent>
            </Card>
            <Card className="border-red-200">
              <CardHeader className="pb-2 flex flex-row justify-between items-center">
                <CardTitle className="text-sm font-medium text-red-600">Disputed</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent><p className="text-2xl font-bold text-red-700">{stats.disputedDeals}</p></CardContent>
            </Card>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-xl font-semibold">Recent Deals</h2>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dealsData?.deals.map((deal) => (
                <TableRow key={deal.id} className={deal.state === "disputed" ? "bg-red-50/50" : ""}>
                  <TableCell className="font-mono text-xs font-semibold text-teal-700 whitespace-nowrap">
                    {deal.invoiceNumber ?? "—"}
                  </TableCell>
                  <TableCell>{format(new Date(deal.createdAt), "MMM d, yyyy")}</TableCell>
                  <TableCell className="font-medium">{deal.title}</TableCell>
                  <TableCell>${deal.totalNzd.toFixed(2)}</TableCell>
                  <TableCell><DealStateBadge state={deal.state} /></TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/deals/${deal.id}`}>
                      <Button variant="ghost" size="sm">Manage</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {dealsData?.deals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">No deals found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {dealsData && dealsData.total > 10 && (
            <div className="p-4 border-t flex justify-between items-center">
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-sm text-slate-500">Page {page} of {Math.ceil(dealsData.total / 10)}</span>
              <Button variant="outline" disabled={page >= Math.ceil(dealsData.total / 10)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
