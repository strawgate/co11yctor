// SPDX-License-Identifier: GPL-2.0
#include <linux/bpf.h>
#include <linux/pkt_cls.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

#define OTLP_GRPC_PORT 4317
#define OTLP_HTTP_PORT 4318
#define MAX_PAYLOAD_SIZE 4096

struct event {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8  direction;
    __u8  proto;
    __u8  pad[2];
    __u32 payload_len;
    __u8  payload[MAX_PAYLOAD_SIZE];
};

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);
} events SEC(".maps");

static __always_inline int handle_packet(struct __sk_buff *skb, __u8 direction) {
    void *data = (void *)(long)skb->data;
    void *data_end = (void *)(long)skb->data_end;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return TC_ACT_OK;

    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return TC_ACT_OK;

    struct iphdr *ip = (void *)(eth + 1);
    if ((void *)(ip + 1) > data_end)
        return TC_ACT_OK;

    if (ip->protocol != IPPROTO_TCP)
        return TC_ACT_OK;

    // Read IP header length from the ihl field via bpf_skb_load_bytes
    // to avoid pointer arithmetic with shift operators
    __u8 ip_byte0;
    if (bpf_skb_load_bytes(skb, sizeof(struct ethhdr), &ip_byte0, 1) < 0)
        return TC_ACT_OK;
    __u32 ip_hdr_len = (ip_byte0 & 0x0F) * 4;
    if (ip_hdr_len < sizeof(struct iphdr) || ip_hdr_len > 60)
        return TC_ACT_OK;

    __u32 tcp_offset = sizeof(struct ethhdr) + ip_hdr_len;

    // Read TCP src/dst ports and data offset via bpf_skb_load_bytes
    __u8 tcp_hdr[14];
    if (bpf_skb_load_bytes(skb, tcp_offset, tcp_hdr, sizeof(tcp_hdr)) < 0)
        return TC_ACT_OK;

    __u16 sport = ((__u16)tcp_hdr[0] << 8) | tcp_hdr[1];
    __u16 dport = ((__u16)tcp_hdr[2] << 8) | tcp_hdr[3];

    if (sport != OTLP_GRPC_PORT && sport != OTLP_HTTP_PORT &&
        dport != OTLP_GRPC_PORT && dport != OTLP_HTTP_PORT)
        return TC_ACT_OK;

    __u8 proto = (sport == OTLP_GRPC_PORT || dport == OTLP_GRPC_PORT) ? 0 : 1;

    // TCP data offset is upper 4 bits of byte 12
    __u32 tcp_hdr_len = ((tcp_hdr[12] >> 4) & 0x0F) * 4;
    if (tcp_hdr_len < 20 || tcp_hdr_len > 60)
        return TC_ACT_OK;

    __u32 payload_offset = tcp_offset + tcp_hdr_len;
    if (payload_offset >= skb->len)
        return TC_ACT_OK;

    __u32 payload_len = skb->len - payload_offset;
    if (payload_len == 0)
        return TC_ACT_OK;

    struct event *e = bpf_ringbuf_reserve(&events, sizeof(struct event), 0);
    if (!e)
        return TC_ACT_OK;

    e->src_ip = ip->saddr;
    e->dst_ip = ip->daddr;
    e->src_port = sport;
    e->dst_port = dport;
    e->direction = direction;
    e->proto = proto;
    e->pad[0] = 0;
    e->pad[1] = 0;

    if (payload_len > MAX_PAYLOAD_SIZE)
        payload_len = MAX_PAYLOAD_SIZE;

    // Verifier needs provable bounds: mask ensures [0, MAX_PAYLOAD_SIZE-1]
    payload_len &= (MAX_PAYLOAD_SIZE - 1);
    if (payload_len == 0) {
        bpf_ringbuf_discard(e, 0);
        return TC_ACT_OK;
    }

    e->payload_len = payload_len;

    long ret = bpf_skb_load_bytes(skb, payload_offset, e->payload, payload_len);
    if (ret < 0) {
        bpf_ringbuf_discard(e, 0);
        return TC_ACT_OK;
    }

    bpf_ringbuf_submit(e, 0);
    return TC_ACT_OK;
}

SEC("tc")
int tc_ingress(struct __sk_buff *skb) {
    return handle_packet(skb, 0);
}

SEC("tc")
int tc_egress(struct __sk_buff *skb) {
    return handle_packet(skb, 1);
}

char _license[] SEC("license") = "GPL";
