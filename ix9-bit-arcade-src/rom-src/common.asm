; IX9 BIT ARCADE — three original NROM-256 homebrew cartridges.
; Built with ca65/ld65. The code targets the stock NES CPU/PPU/APU register map.

PPUCTRL   = $2000
PPUMASK   = $2001
PPUSTATUS = $2002
OAMADDR   = $2003
PPUSCROLL = $2005
PPUADDR   = $2006
PPUDATA   = $2007
OAMDMA    = $4014
PAD1      = $4016
APUSTATUS = $4015
OAM       = $0200

BTN_A      = $80
BTN_B      = $40
BTN_SELECT = $20
BTN_START  = $10
BTN_UP     = $08
BTN_DOWN   = $04
BTN_LEFT   = $02
BTN_RIGHT  = $01

.segment "HEADER"
    .byte $4E, $45, $53, $1A
    .byte 2                 ; 32 KiB PRG ROM
    .byte 1                 ; 8 KiB CHR ROM
    .byte $01               ; mapper 0, vertical mirroring
    .byte $00
    .byte $00, $00, $00, $00, $00, $00, $00, $00

.segment "ZEROPAGE"
frame_counter: .res 1
pad:           .res 1
prev_pad:      .res 1
pad_pressed:   .res 1
redraw:        .res 1
scroll_y:      .res 1
ptr_lo:        .res 1
ptr_hi:        .res 1
tmp:           .res 1
tmp2:          .res 1

; Shared game state. Keeping the carts on one small engine makes the source readable.
timer:         .res 1
score:         .res 1
direction:     .res 1
length:        .res 1
head_x:        .res 1
head_y:        .res 1
fruit_x:       .res 1
fruit_y:       .res 1
player_x:      .res 1
rival_x:       .res 1
rival_y:       .res 1
page:          .res 1

.segment "BSS"
snake_x: .res 12
snake_y: .res 12

.segment "CODE"

.proc reset
    sei
    cld
    ldx #$40
    stx $4017
    ldx #$FF
    txs
    inx
    stx PPUCTRL
    stx PPUMASK
    stx APUSTATUS

wait_vblank_1:
    bit PPUSTATUS
    bpl wait_vblank_1

    lda #$00
    tax
clear_ram:
    sta $0000, x
    sta $0100, x
    sta $0300, x
    sta $0400, x
    sta $0500, x
    sta $0600, x
    sta $0700, x
    inx
    bne clear_ram

    lda #$FE
    ldx #$00
hide_oam:
    sta OAM, x
    inx
    inx
    inx
    inx
    bne hide_oam

wait_vblank_2:
    bit PPUSTATUS
    bpl wait_vblank_2

    jsr game_init
    jsr draw_current_screen

    lda #$01
    sta APUSTATUS
    lda #%00111111
    sta $4000

    lda #%10000000
    sta PPUCTRL
    lda #%00011110
    sta PPUMASK

main_loop:
    lda redraw
    beq main_loop
    lda #$00
    sta PPUCTRL
    sta PPUMASK
wait_redraw_vblank:
    bit PPUSTATUS
    bpl wait_redraw_vblank
    jsr draw_current_screen
    lda #$00
    sta redraw
    lda #%10000000
    sta PPUCTRL
    lda #%00011110
    sta PPUMASK
    jmp main_loop
.endproc

.proc nmi
    pha
    txa
    pha
    tya
    pha

    inc frame_counter
    jsr read_controller
    jsr game_update

    lda #$00
    sta OAMADDR
    lda #$02
    sta OAMDMA

    bit PPUSTATUS
    lda #$00
    sta PPUSCROLL
.if ::GAME_ID = 2
    lda scroll_y
.else
    lda #$00
.endif
    sta PPUSCROLL

    pla
    tay
    pla
    tax
    pla
    rti
.endproc

.proc irq
    rti
.endproc

.proc read_controller
    lda pad
    sta prev_pad
    lda #$01
    sta PAD1
    lda #$00
    sta PAD1
    sta pad
    ldx #$08
read_bit:
    lda PAD1
    lsr a
    rol pad
    dex
    bne read_bit
    lda pad
    eor prev_pad
    and pad
    sta pad_pressed
    rts
.endproc

.proc load_palette
    bit PPUSTATUS
    lda #$3F
    sta PPUADDR
    lda #$00
    sta PPUADDR
    ldx #$00
loop:
    lda palette_data, x
    sta PPUDATA
    inx
    cpx #$20
    bne loop
    rts
.endproc

.proc select_screen
.if ::GAME_ID = 3
    lda page
    beq p0
    cmp #$01
    beq p1
    cmp #$02
    beq p2
    lda #<screen_3
    sta ptr_lo
    lda #>screen_3
    sta ptr_hi
    rts
p2:
    lda #<screen_2
    sta ptr_lo
    lda #>screen_2
    sta ptr_hi
    rts
p1:
    lda #<screen_1
    sta ptr_lo
    lda #>screen_1
    sta ptr_hi
    rts
p0:
.endif
    lda #<screen_0
    sta ptr_lo
    lda #>screen_0
    sta ptr_hi
    rts
.endproc

.proc draw_current_screen
    jsr load_palette
    jsr select_screen
    bit PPUSTATUS
    lda #$20
    sta PPUADDR
    lda #$00
    sta PPUADDR
    ldx #$04
    ldy #$00
copy_page:
    lda (ptr_lo), y
    sta PPUDATA
    iny
    bne copy_page
    inc ptr_hi
    dex
    bne copy_page
    lda #$00
    sta PPUSCROLL
    sta PPUSCROLL
    rts
.endproc

.proc beep
    lda #$9F
    sta $4002
    lda #$08
    sta $4003
    rts
.endproc

; -----------------------------------------------------------------------------
; Game 1: NEON SNAKE
; -----------------------------------------------------------------------------
.if GAME_ID = 1

.proc game_init
    lda #$06
    sta length
    lda #$01
    sta direction
    lda #$00
    sta timer
    sta score
    ldx #$00
init_x:
    lda snake_start_x, x
    sta snake_x, x
    lda #$70
    sta snake_y, x
    inx
    cpx #$0C
    bne init_x
    lda #$70
    sta head_x
    sta head_y
    lda #$A8
    sta fruit_x
    lda #$50
    sta fruit_y
    jsr snake_render
    rts
.endproc

.proc snake_restart
    jsr beep
    jmp game_init
.endproc

.proc game_update
    lda pad_pressed
    and #BTN_UP
    beq check_down
    lda direction
    cmp #$02
    beq check_down
    lda #$00
    sta direction
check_down:
    lda pad_pressed
    and #BTN_DOWN
    beq check_left
    lda direction
    cmp #$00
    beq check_left
    lda #$02
    sta direction
check_left:
    lda pad_pressed
    and #BTN_LEFT
    beq check_right
    lda direction
    cmp #$01
    beq check_right
    lda #$03
    sta direction
check_right:
    lda pad_pressed
    and #BTN_RIGHT
    beq check_reset
    lda direction
    cmp #$03
    beq check_reset
    lda #$01
    sta direction
check_reset:
    lda pad_pressed
    and #BTN_START
    beq tick
    jmp snake_restart
tick:
    inc timer
    lda timer
    and #$07
    beq do_move
    jmp render_only
do_move:

    ldx length
    dex
shift_body:
    lda snake_x - 1, x
    sta snake_x, x
    lda snake_y - 1, x
    sta snake_y, x
    dex
    bne shift_body

    lda direction
    beq move_up
    cmp #$01
    beq move_right
    cmp #$02
    beq move_down
move_left:
    lda head_x
    sec
    sbc #$08
    sta head_x
    jmp moved
move_right:
    lda head_x
    clc
    adc #$08
    sta head_x
    jmp moved
move_up:
    lda head_y
    sec
    sbc #$08
    sta head_y
    jmp moved
move_down:
    lda head_y
    clc
    adc #$08
    sta head_y
moved:
    lda head_x
    sta snake_x
    cmp #$10
    bcc restart
    cmp #$E9
    bcs restart
    lda head_y
    sta snake_y
    cmp #$28
    bcc restart
    cmp #$D9
    bcs restart

    ldx #$01
self_loop:
    cpx length
    bcs fruit_check
    lda head_x
    cmp snake_x, x
    bne self_next
    lda head_y
    cmp snake_y, x
    beq restart
self_next:
    inx
    jmp self_loop

fruit_check:
    lda head_x
    cmp fruit_x
    bne render_only
    lda head_y
    cmp fruit_y
    bne render_only
    inc score
    lda length
    cmp #$0C
    bcs no_grow
    inc length
no_grow:
    jsr beep
    lda score
    and #$07
    asl a
    tax
    lda fruit_positions, x
    sta fruit_x
    lda fruit_positions + 1, x
    sta fruit_y
    jmp render_only
restart:
    jmp snake_restart
render_only:
    jsr snake_render
    rts
.endproc

.proc snake_render
    ; score digit
    lda #$0F
    sta OAM
    lda score
    and #$0F
    clc
    adc #$1B
    sta OAM + 1
    lda #$03
    sta OAM + 2
    lda #$D8
    sta OAM + 3

    ldx #$00
    ldy #$04
body_loop:
    cpx length
    bcs fruit
    lda snake_y, x
    sec
    sbc #$01
    sta OAM, y
    iny
    cpx #$00
    bne body_tile
    lda #$41
    bne tile_done
body_tile:
    lda #$40
tile_done:
    sta OAM, y
    iny
    lda #$01
    sta OAM, y
    iny
    lda snake_x, x
    sta OAM, y
    iny
    inx
    jmp body_loop
fruit:
    lda fruit_y
    sec
    sbc #$01
    sta OAM, y
    iny
    lda #$42
    sta OAM, y
    iny
    lda #$02
    sta OAM, y
    iny
    lda fruit_x
    sta OAM, y
    rts
.endproc

fruit_positions:
    .byte $30,$58, $C0,$88, $50,$C0, $B8,$38
    .byte $88,$98, $38,$B0, $D0,$70, $68,$48
snake_start_x:
    .byte $70,$68,$60,$58,$50,$48,$40,$38,$30,$28,$20,$18

; -----------------------------------------------------------------------------
; Game 2: APEX 8
; -----------------------------------------------------------------------------
.elseif GAME_ID = 2

.proc game_init
    lda #$78
    sta player_x
    lda #$50
    sta rival_x
    lda #$18
    sta rival_y
    lda #$00
    sta scroll_y
    sta score
    jsr race_render
    rts
.endproc

.proc game_update
    lda pad
    and #BTN_LEFT
    beq race_right
    lda player_x
    cmp #$39
    bcc race_right
    sec
    sbc #$02
    sta player_x
race_right:
    lda pad
    and #BTN_RIGHT
    beq race_speed
    lda player_x
    cmp #$C8
    bcs race_speed
    clc
    adc #$02
    sta player_x
race_speed:
    lda #$02
    sta tmp
    lda pad
    and #BTN_A
    beq do_scroll
    inc tmp
do_scroll:
    lda scroll_y
    clc
    adc tmp
    sta scroll_y
    lda rival_y
    clc
    adc tmp
    sta rival_y
    cmp #$E8
    bcc collision
    lda #$08
    sta rival_y
    inc score
    lda score
    and #$03
    tax
    lda rival_lanes, x
    sta rival_x
collision:
    lda rival_y
    cmp #$A8
    bcc no_hit
    cmp #$D0
    bcs no_hit
    lda player_x
    sec
    sbc rival_x
    bcs positive_diff
    eor #$FF
    clc
    adc #$01
positive_diff:
    cmp #$12
    bcs no_hit
    jsr beep
    jsr game_init
no_hit:
    lda pad_pressed
    and #BTN_START
    beq race_draw
    jsr game_init
race_draw:
    jsr race_render
    rts
.endproc

.proc race_render
    ; score digit
    lda #$0F
    sta OAM
    lda score
    and #$0F
    clc
    adc #$1B
    sta OAM + 1
    lda #$03
    sta OAM + 2
    lda #$D8
    sta OAM + 3

    ; player 2x2
    lda #$AF
    sta OAM + 4
    sta OAM + 8
    lda #$B7
    sta OAM + 12
    sta OAM + 16
    lda #$40
    sta OAM + 5
    lda #$41
    sta OAM + 9
    lda #$42
    sta OAM + 13
    lda #$43
    sta OAM + 17
    lda #$01
    sta OAM + 6
    sta OAM + 10
    sta OAM + 14
    sta OAM + 18
    lda player_x
    sta OAM + 7
    sta OAM + 15
    clc
    adc #$08
    sta OAM + 11
    sta OAM + 19

    ; rival 2x2
    lda rival_y
    sta OAM + 20
    sta OAM + 24
    clc
    adc #$08
    sta OAM + 28
    sta OAM + 32
    lda #$44
    sta OAM + 21
    lda #$45
    sta OAM + 25
    lda #$46
    sta OAM + 29
    lda #$47
    sta OAM + 33
    lda #$02
    sta OAM + 22
    sta OAM + 26
    sta OAM + 30
    sta OAM + 34
    lda rival_x
    sta OAM + 23
    sta OAM + 31
    clc
    adc #$08
    sta OAM + 27
    sta OAM + 35
    rts
.endproc

rival_lanes:
    .byte $40, $70, $A0, $C0

; -----------------------------------------------------------------------------
; Game 3: 月影のレター
; -----------------------------------------------------------------------------
.else

.proc game_init
    lda #$00
    sta page
    rts
.endproc

.proc game_update
    lda pad_pressed
    and #(BTN_A | BTN_RIGHT | BTN_START)
    beq novel_done
    inc page
    lda page
    and #$03
    sta page
    lda #$01
    sta redraw
    jsr beep
novel_done:
    rts
.endproc

.endif

.segment "RODATA"

.if GAME_ID = 1
palette_data:
    .byte $0F,$1D,$2A,$3A, $0F,$07,$17,$27, $0F,$16,$26,$36, $0F,$00,$10,$30
    .byte $0F,$0A,$1A,$2A, $0F,$16,$27,$37, $0F,$06,$17,$28, $0F,$00,$10,$30
screen_0:
    .incbin "generated/snake.nam"
.elseif GAME_ID = 2
palette_data:
    .byte $0F,$01,$11,$21, $0F,$06,$16,$26, $0F,$08,$18,$28, $0F,$00,$10,$30
    .byte $0F,$06,$16,$27, $0F,$08,$18,$28, $0F,$02,$12,$22, $0F,$00,$10,$30
screen_0:
    .incbin "generated/race.nam"
.else
palette_data:
    .byte $0F,$02,$12,$22, $0F,$07,$17,$27, $0F,$08,$18,$28, $0F,$00,$10,$30
    .byte $0F,$06,$16,$26, $0F,$09,$19,$29, $0F,$02,$12,$22, $0F,$00,$10,$30
screen_0:
    .incbin "generated/novel-0.nam"
screen_1:
    .incbin "generated/novel-1.nam"
screen_2:
    .incbin "generated/novel-2.nam"
screen_3:
    .incbin "generated/novel-3.nam"
.endif

.segment "VECTORS"
    .word nmi
    .word reset
    .word irq

.segment "CHR"
.if GAME_ID = 1
    .incbin "generated/snake.chr"
.elseif GAME_ID = 2
    .incbin "generated/race.chr"
.else
    .incbin "generated/novel.chr"
.endif
