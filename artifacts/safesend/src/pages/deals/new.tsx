import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle, DollarSign, ExternalLink, Hash, ShieldCheck, ArrowRight, ShoppingBag, Tag, Lock, BadgeCheck } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCreateDeal, useGetMe } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const phoneSchema = z
  .string()
  .optional()
  .transform(v => (!v || v.trim() === "" ? undefined : v.trim()))
  .refine(v => !v || /^[0-9\s\-().+]{7,20}$/.test(v), { message: "Enter a valid phone number" });

const baseSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().min(10, "Description must be at least 10 characters"),
  amountNzd: z.coerce.number().min(5, "Amount must be at least $5").max(2500, "Amount cannot exceed $2,500 NZD"),
  buyerEmail: z.string().email("Invalid buyer email"),
  sellerEmail: z.string().email("Invalid seller email"),
  myName: z.string().min(2, "Name must be at least 2 characters").max(100),
  myPhone: phoneSchema,
  itemUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  referenceNumber: z.string().max(80, "Reference too long").optional(),
  escrowConsentAccepted: z.boolean().refine(v => v === true, { message: "You must acknowledge the escrow terms to continue" }),
  termsAccepted: z.boolean().refine(v => v === true, { message: "You must accept the Terms of Service to continue" }),
}).refine(data => data.buyerEmail !== data.sellerEmail, {
  message: "Buyer and seller emails cannot be the same",
  path: ["buyerEmail"],
});

type FormValues = z.infer<typeof baseSchema>;
type Role = "seller" | "buyer";

export default function NewDeal() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [role, setRole] = useState<Role | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const createDeal = useCreateDeal();
  const { data: me, isLoading: meLoading } = useGetMe();

  // Redirect to login if not authenticated — deal creation requires a verified email
  useEffect(() => {
    if (!meLoading && !me?.email) {
      setLocation(`/login?next=${encodeURIComponent("/deals/new")}`);
    }
  }, [me, meLoading, setLocation]);

  const form = useForm<FormValues>({
    resolver: zodResolver(baseSchema),
    defaultValues: {
      title: "",
      description: "",
      amountNzd: 0,
      buyerEmail: "",
      sellerEmail: "",
      myName: "",
      myPhone: "",
      itemUrl: "",
      referenceNumber: "",
      escrowConsentAccepted: false,
      termsAccepted: false,
    },
  });

  // Lock the creator's email field to their verified profile email.
  // This cannot be overridden by URL params — the API enforces the same check.
  useEffect(() => {
    if (!me?.email || !role) return;
    if (role === "seller") form.setValue("sellerEmail", me.email);
    if (role === "buyer") form.setValue("buyerEmail", me.email);
  }, [me?.email, role, form]);

  // URL pre-fill (shared links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get("title");
    const amount = params.get("amount");
    const description = params.get("description");
    const sellerEmail = params.get("sellerEmail");
    const buyerEmail = params.get("buyerEmail");
    const itemUrl = params.get("itemUrl");
    const referenceNumber = params.get("referenceNumber");
    const roleParam = params.get("role") as Role | null;

    let hasPrefill = false;
    if (title) { form.setValue("title", title); hasPrefill = true; }
    if (amount) { form.setValue("amountNzd", Number(amount)); hasPrefill = true; }
    if (description) { form.setValue("description", description); hasPrefill = true; }
    // Only pre-fill counterparty emails from URL, never your own (it comes from session)
    if (sellerEmail && roleParam !== "seller") { form.setValue("sellerEmail", sellerEmail); hasPrefill = true; }
    if (buyerEmail && roleParam !== "buyer") { form.setValue("buyerEmail", buyerEmail); hasPrefill = true; }
    if (itemUrl) { form.setValue("itemUrl", itemUrl); hasPrefill = true; }
    if (referenceNumber) { form.setValue("referenceNumber", referenceNumber); hasPrefill = true; }
    if (roleParam === "seller" || roleParam === "buyer") setRole(roleParam);
    if (hasPrefill) setPrefilled(true);
  }, [form]);

  const amountNzd = Number(form.watch("amountNzd")) || 0;
  const fee = Math.max(5, amountNzd * 0.04);
  const kycFee = amountNzd >= 1000 ? 2.50 : 0;
  const total = amountNzd + fee + kycFee;

  function onSubmit(values: FormValues) {
    if (!role) return;

    // Map myPhone to the correct role-specific phone field
    const buyerPhone = role === "buyer" ? values.myPhone : undefined;
    const sellerPhone = role === "seller" ? values.myPhone : undefined;

    createDeal.mutate(
      {
        data: {
          title: values.title,
          description: values.description,
          amountNzd: values.amountNzd,
          buyerEmail: values.buyerEmail,
          sellerEmail: values.sellerEmail,
          buyerPhone: buyerPhone || null,
          sellerPhone: sellerPhone || null,
          itemUrl: values.itemUrl || null,
          referenceNumber: values.referenceNumber || null,
          creatorRole: role,
        },
      },
      {
        onSuccess: (deal) => {
          toast({
            title: "Deal created",
            description:
              role === "seller"
                ? "Share the link with the buyer so they can confirm and pay."
                : "Share the link with the seller so they can confirm the item details.",
          });
          setLocation(`/deals/${deal.id}`);
        },
        onError: (error: unknown) => {
          const msg = error instanceof Error ? error.message : "Failed to create deal. Please try again.";
          toast({ title: "Error creating deal", description: msg, variant: "destructive" });
        },
      },
    );
  }

  // ── Step 1: Role selection ─────────────────────────────────────
  if (!role) {
    return (
      <Layout>
        <div className="container max-w-2xl mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="h-8 w-8 text-teal-700" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">Start a Secure Deal</h1>
            <p className="text-slate-600 text-lg max-w-md mx-auto">
              First, tell us your role. You'll only fill in your own details — the other party confirms theirs separately.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              onClick={() => setRole("seller")}
              className="group text-left bg-white border-2 border-slate-200 hover:border-teal-500 rounded-2xl p-8 shadow-sm transition-all hover:shadow-md"
            >
              <div className="w-14 h-14 bg-teal-50 group-hover:bg-teal-100 rounded-xl flex items-center justify-center mb-5 transition-colors">
                <Tag className="h-7 w-7 text-teal-700" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">I'm the Seller</h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                I'm listing an item for sale. I'll set the price, describe the item, and invite the buyer to confirm.
              </p>
              <div className="flex items-center gap-1.5 text-teal-700 text-sm font-semibold">
                Continue as Seller <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              onClick={() => setRole("buyer")}
              className="group text-left bg-white border-2 border-slate-200 hover:border-blue-500 rounded-2xl p-8 shadow-sm transition-all hover:shadow-md"
            >
              <div className="w-14 h-14 bg-blue-50 group-hover:bg-blue-100 rounded-xl flex items-center justify-center mb-5 transition-colors">
                <ShoppingBag className="h-7 w-7 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">I'm the Buyer</h2>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                I want to buy something safely. I'll enter what we agreed on and invite the seller to confirm their details.
              </p>
              <div className="flex items-center gap-1.5 text-blue-600 text-sm font-semibold">
                Continue as Buyer <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-slate-400 mt-8">
            Your email will be locked to your role — you cannot be both buyer and seller.
          </p>
        </div>
      </Layout>
    );
  }

  // ── Step 2: Deal form ──────────────────────────────────────────
  const isSeller = role === "seller";
  const myEmailField = isSeller ? "sellerEmail" : "buyerEmail";
  const theirEmailField = isSeller ? "buyerEmail" : "sellerEmail";
  const myLabel = isSeller ? "Your email (seller)" : "Your email (buyer)";
  const theirLabel = isSeller ? "Buyer's email — invite them" : "Seller's email — invite them";
  const theirNote = isSeller
    ? "They'll receive a link to review these terms and confirm as buyer before you can be paid."
    : "They'll receive a link to confirm the item details and their own information.";
  const accentColor = isSeller ? "border-teal-500" : "border-blue-500";
  const accentBadgeBg = isSeller ? "bg-teal-700" : "bg-blue-600";

  return (
    <Layout>
      <div className="container max-w-2xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => setRole(null)}
            className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            ← Change role
          </button>
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full text-white ${accentBadgeBg}`}>
            {isSeller ? <Tag className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
            {isSeller ? "Creating as Seller" : "Creating as Buyer"}
          </span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Create a New Deal</h1>
          <p className="text-slate-600 mt-2">
            Fill in your details and the item info. The {isSeller ? "buyer" : "seller"} will confirm their own details separately before any money changes hands.
          </p>
        </div>

        {prefilled && (
          <Alert className="mb-6 bg-teal-50 border-teal-200">
            <AlertCircle className="h-4 w-4 text-teal-700" />
            <AlertTitle className="text-teal-800">Pre-filled from shared link</AlertTitle>
            <AlertDescription className="text-teal-700">
              Review all details carefully before submitting.
            </AlertDescription>
          </Alert>
        )}

        <div className={`bg-white rounded-xl shadow-sm border-2 ${accentColor} p-6 md:p-8`}>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              {/* ── Your Details ──────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold ${accentBadgeBg}`}>✓</div>
                  <h2 className="text-lg font-semibold text-slate-800">Your Details</h2>
                  <span className="text-xs text-slate-400 ml-auto">Only you can fill this section</span>
                </div>

                <FormField
                  control={form.control}
                  name={myEmailField}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{myLabel}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type="email"
                            {...field}
                            readOnly
                            className="bg-slate-50 text-slate-700 pr-10 cursor-not-allowed"
                          />
                          <BadgeCheck className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-600" />
                        </div>
                      </FormControl>
                      <FormDescription className="text-xs text-slate-500 flex items-center gap-1">
                        <BadgeCheck className="h-3 w-3 text-teal-600" />
                        Verified SafeSend account — locked to your sign-in email.
                        {me?.verifiedAt && (
                          <span className="text-slate-400">
                            · Member since {new Date(me.verifiedAt).toLocaleDateString("en-NZ", { month: "short", year: "numeric" })}
                          </span>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="myName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your full name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Jane Smith" autoComplete="name" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Required for AML/CFT compliance under NZ law. Not shared with the other party.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="myPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Your mobile number
                        <span className="text-xs font-normal text-slate-400 ml-1">optional</span>
                      </FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+64 21 000 0000" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        For SMS alerts at key deal milestones. Phone is verified before payment. Never shared with the other party.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Item Details ──────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">i</div>
                  <h2 className="text-lg font-semibold text-slate-800">Item Details</h2>
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Title</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Gibson Les Paul 2019 Standard" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Make, model, year, condition, colour, serial number, accessories, known defects. Be specific — this is the legally binding description."
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription className="text-xs text-slate-500">
                        The more detail, the less room for dispute.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="itemUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <ExternalLink className="h-4 w-4 text-slate-400" />
                          Listing URL
                          <span className="text-xs font-normal text-slate-400">optional</span>
                        </FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://www.facebook.com/marketplace/…" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Hash className="h-4 w-4 text-slate-400" />
                          Reference / PO
                          <span className="text-xs font-normal text-slate-400">optional</span>
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. PO-2024-001" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="amountNzd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Agreed Price (NZD)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                          <Input type="number" min={5} max={2500} step="0.01" placeholder="0.00" className="pl-9" {...field} />
                        </div>
                      </FormControl>
                      <FormMessage />
                      {amountNzd >= 5 && (
                        <div className="mt-2 text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Item price</span>
                            <span>${amountNzd.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">SafeSend fee (4%, min $5)</span>
                            <span>${fee.toFixed(2)}</span>
                          </div>
                          {kycFee > 0 && (
                            <div className="flex justify-between text-amber-700">
                              <span className="flex items-center gap-1">
                                Enhanced ID verification
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">$1,000+ deal</span>
                              </span>
                              <span>${kycFee.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5">
                            <span>Total charged to buyer</span>
                            <span>${total.toFixed(2)} NZD</span>
                          </div>
                        </div>
                      )}
                      {amountNzd > 2500 && (
                        <p className="text-sm text-amber-700 mt-1">
                          Deals over $2,500 NZD are handled by{" "}
                          <a href="https://www.escrow.com" target="_blank" rel="noopener noreferrer" className="underline">Escrow.com</a>.
                        </p>
                      )}
                    </FormItem>
                  )}
                />
              </div>

              {/* ── Invite Other Party ────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b pb-2">
                  <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center">
                    <Lock className="h-3 w-3 text-slate-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-800">
                    {isSeller ? "Invite the Buyer" : "Invite the Seller"}
                  </h2>
                  <span className="text-xs text-slate-400 ml-auto">They confirm their own details</span>
                </div>

                <Alert className="bg-slate-50 border-slate-200">
                  <AlertCircle className="h-4 w-4 text-slate-500" />
                  <AlertDescription className="text-slate-600 text-sm">
                    {theirNote}
                  </AlertDescription>
                </Alert>

                <FormField
                  control={form.control}
                  name={theirEmailField}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{theirLabel}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="their@email.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <Lock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-500">
                    The {isSeller ? "buyer's" : "seller's"} phone number and any other details are filled in by <em>them</em> — you cannot enter information on their behalf.
                  </p>
                </div>
              </div>

              {/* ── Consent ───────────────────────────── */}
              <div className="space-y-4 pt-2 border-t border-slate-100">
                <FormField
                  control={form.control}
                  name="escrowConsentAccepted"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                      </FormControl>
                      <div className="text-sm text-slate-700 leading-relaxed">
                        I understand that funds will be held in escrow and released only after delivery is confirmed or a dispute is resolved. I have described the item accurately and agree to SafeSend's{" "}
                        <a href="/escrow-agreement" target="_blank" className="text-teal-700 underline">Escrow Agreement</a>.
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="termsAccepted"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} className="mt-0.5" />
                      </FormControl>
                      <div className="text-sm text-slate-700 leading-relaxed">
                        I accept the{" "}
                        <a href="/terms" target="_blank" className="text-teal-700 underline">Terms of Service</a>.
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className={`w-full text-white font-semibold h-12 ${isSeller ? "bg-teal-700 hover:bg-teal-800" : "bg-blue-600 hover:bg-blue-700"}`}
                disabled={createDeal.isPending}
              >
                {createDeal.isPending ? "Creating deal…" : `Create Deal & Invite ${isSeller ? "Buyer" : "Seller"}`}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </Layout>
  );
}
