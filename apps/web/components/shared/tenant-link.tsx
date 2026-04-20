"use client";

import NextLink from "next/link";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import type { LinkProps } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getTenantSlugFromPathname, withTenantPrefix } from "@/lib/auth/tenant-routing";

type TenantLinkProps = PropsWithChildren<
  LinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>
>;
type RouterInstance = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<RouterInstance["push"]>[1];

export function useTenantHref<T extends LinkProps["href"]>(href: T): T {
  const pathname = usePathname();
  const tenantSlug = getTenantSlugFromPathname(pathname);
  return withTenantPrefix(href, tenantSlug);
}

export function useTenantRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const tenantSlug = getTenantSlugFromPathname(pathname);

  return {
    ...router,
    push(href: Parameters<RouterInstance["push"]>[0], options?: NavigateOptions) {
      return router.push(withTenantPrefix(href, tenantSlug), options);
    },
    replace(href: Parameters<RouterInstance["replace"]>[0], options?: NavigateOptions) {
      return router.replace(withTenantPrefix(href, tenantSlug), options);
    },
    prefetch(href: Parameters<RouterInstance["prefetch"]>[0], options?: Parameters<RouterInstance["prefetch"]>[1]) {
      return router.prefetch(withTenantPrefix(href, tenantSlug), options);
    },
  };
}

export default function TenantLink({ href, ...props }: TenantLinkProps) {
  const tenantHref = useTenantHref(href);
  return <NextLink href={tenantHref} {...props} />;
}
