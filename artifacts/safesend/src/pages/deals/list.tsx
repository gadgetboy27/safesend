import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useListDeals, useGetMe, getListDealsQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { DealStateBadge } from "@/components/deal-state-badge";
import { Inbox, ArrowRight, LogIn, Hash } from "lucide-react";
import { format } from "date-fns";

export default function MyDeals() {
  const [, navigate] = useLocation();

  const { data: me, isLoading: meLoading, isError: meError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false }
  });

  const { data: deals, isLoading: dealsLoading } = useListDeals(
    undefined,
    { query: { enabled: !!me?.email, queryKey: getListDealsQueryKey() } }
  );

  const isLoading = meLoading || dealsLoading;

  if (meError) {
    return (
      <Layout>
        <div className="container max-w-sm mx-auto px-4 py-20 text-center">
          <LogIn className="w-12 h-12 text-teal-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Sign in to view your deals</h1>
          <p className="text-slate-600 mb-6">You need to be signed in to see your deals.</p>
          <Button
            className="bg-teal-700 hover:bg-teal-800 text-white"
            onClick={() => navigate("/login?next=/deals")}
          >
            Sign in
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">My Deals</h1>
          {me?.email && (
            <p className="text-slate-500 text-sm">Showing deals for {me.email}</p>
          )}
        </div>

        {isLoading && (
          <div className="text-center py-12 text-slate-500">Loading your deals...</div>
        )}

        {!isLoading && deals && deals.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
            <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No deals yet</h3>
            <p className="text-slate-600 mb-6">You have no deals as a buyer or seller yet.</p>
            <Link href="/deals/new">
              <Button className="bg-teal-700 hover:bg-teal-800 text-white">Create a New Deal</Button>
            </Link>
          </div>
        )}

        {!isLoading && deals && deals.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {deals.map((deal) => {
              const isBuyer = deal.buyerEmail.toLowerCase() === (me?.email ?? "").toLowerCase();
              const roleLabel = isBuyer ? "Buyer" : "Seller";

              return (
                <Link key={deal.id} href={`/deals/${deal.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200 h-full flex flex-col">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start mb-2">
                        <DealStateBadge state={deal.state} />
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                          {roleLabel}
                        </span>
                      </div>
                      <CardTitle className="text-xl">{deal.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 flex-wrap">
                        <span>{format(new Date(deal.createdAt), "MMM d, yyyy")}</span>
                        {deal.invoiceNumber && (
                          <span className="flex items-center gap-1 font-mono text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            <Hash className="w-3 h-3" />{deal.invoiceNumber}
                          </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex-1">
                      <p className="text-2xl font-bold text-slate-900">
                        ${deal.totalNzd.toFixed(2)} <span className="text-sm font-normal text-slate-500">NZD</span>
                      </p>
                    </CardContent>
                    <CardFooter className="pt-3 border-t text-sm text-teal-700 font-medium flex items-center justify-between">
                      View Deal Details
                      <ArrowRight className="w-4 h-4" />
                    </CardFooter>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
